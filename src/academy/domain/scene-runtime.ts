import type { ActivityModel } from './activity-runtime';

export type SceneValue = string | number | boolean;
export type SceneFlags = Readonly<Record<string, SceneValue>>;
export type SceneBand = 'foundation' | 'n5' | 'n4' | 'n3' | 'n2' | 'n1';
export type StagePosition = 'left' | 'center' | 'right';

export interface SceneLine {
    readonly kind: 'line';
    readonly id: string;
    readonly speaker?: string;
    readonly expression?: string;
    readonly ja?: string;
    readonly en?: string;
}

export interface SceneChoiceOption {
    readonly id: string;
    readonly ja?: string;
    readonly en: string;
    readonly to?: string;
    readonly set?: SceneFlags;
}

export interface SceneChoice {
    readonly kind: 'choice';
    readonly id: string;
    readonly prompt?: SceneLine;
    readonly options: readonly SceneChoiceOption[];
}

export interface SceneStageDirection {
    readonly kind: 'stage';
    readonly id: string;
    readonly plate?: string;
    readonly theme?: string;
    readonly ambience?: string;
    readonly sprites?: readonly {
        readonly character: string;
        readonly expression: string;
        readonly position: StagePosition;
    }[];
}

export interface SceneActivity {
    readonly kind: 'activity';
    readonly id: string;
    readonly activity: ActivityModel;
}

export type SceneNode =
    | SceneLine
    | SceneChoice
    | SceneStageDirection
    | SceneActivity
    | { readonly kind: 'label'; readonly id: string; readonly name: string }
    | { readonly kind: 'jump'; readonly id: string; readonly to: string }
    | { readonly kind: 'gate'; readonly id: string; readonly flag: string; readonly equals?: SceneValue; readonly atLeast?: number; readonly to: string }
    | { readonly kind: 'set'; readonly id: string; readonly flags: SceneFlags }
    | { readonly kind: 'complete'; readonly id: string; readonly result?: SceneFlags };

export interface SceneScript {
    readonly id: string;
    readonly revision: string;
    readonly title: string;
    readonly band: SceneBand;
    readonly nodes: readonly SceneNode[];
}

export interface SceneSnapshot {
    readonly sceneId: string;
    readonly revision: string;
    readonly cursor: number;
    readonly flags: SceneFlags;
    readonly choices: readonly string[];
    readonly readLineIds: readonly string[];
}

export interface SceneResult {
    readonly completed: boolean;
    readonly snapshot: SceneSnapshot;
}

export interface SceneHost {
    direct(direction: SceneStageDirection): Promise<void>;
    line(line: SceneLine): Promise<void>;
    choice(choice: SceneChoice): Promise<string>;
    activity(activity: SceneActivity): Promise<SceneFlags>;
    finish(): Promise<void>;
    dispose(): void;
}

export interface ScenePlayOptions {
    readonly host: SceneHost;
    readonly snapshot?: SceneSnapshot;
    readonly flags?: SceneFlags;
    readonly signal?: AbortSignal;
    readonly onCheckpoint?: (snapshot: SceneSnapshot) => void | Promise<void>;
}

export interface SceneRuntime {
    play(script: SceneScript, options: ScenePlayOptions): Promise<SceneResult>;
    validate(script: SceneScript): readonly string[];
}

export function createSceneRuntime(): SceneRuntime {
    return { play: playScene, validate: validateScene };
}

interface SceneExecutionState {
    readonly script: SceneScript;
    readonly options: ScenePlayOptions;
    readonly labels: ReadonlyMap<string, number>;
    readonly flags: Record<string, SceneValue>;
    readonly choices: string[];
    readonly readLineIds: Set<string>;
    cursor: number;
    completed: boolean;
    steps: number;
    readonly guardLimit: number;
}

type SceneNodeOfKind<Kind extends SceneNode['kind']> = Extract<SceneNode, { kind: Kind }>;
type SceneNodeHandlers = {
    readonly [Kind in SceneNode['kind']]: (
        node: SceneNodeOfKind<Kind>,
        state: SceneExecutionState,
    ) => void | Promise<void>;
};

const SCENE_NODE_HANDLERS: SceneNodeHandlers = {
    label: (_node, state) => advanceScene(state),
    jump: (node, state) => {
        state.cursor = requireLabel(state.labels, node.to, state.script.id);
    },
    gate: (node, state) => {
        state.cursor = gateMatches(state.flags[node.flag], node)
            ? requireLabel(state.labels, node.to, state.script.id)
            : state.cursor + 1;
    },
    set: (node, state) => {
        Object.assign(state.flags, node.flags);
        advanceScene(state);
    },
    stage: async (node, state) => {
        await state.options.host.direct(node);
        advanceScene(state);
    },
    line: async (node, state) => {
        await state.options.host.line(node);
        state.readLineIds.add(node.id);
        advanceScene(state);
    },
    choice: applySceneChoice,
    activity: async (node, state) => {
        Object.assign(state.flags, await state.options.host.activity(node));
        advanceScene(state);
    },
    complete: async (node, state) => {
        if (node.result) Object.assign(state.flags, node.result);
        state.cursor = state.script.nodes.length;
        state.completed = true;
        await state.options.host.finish();
    },
};

async function playScene(script: SceneScript, options: ScenePlayOptions): Promise<SceneResult> {
    const issues = validateScene(script);
    if (issues.length) throw new Error(`Scene ${script.id} is invalid: ${issues.join('; ')}`);
    const state = createSceneExecutionState(script, options);

    try {
        await runScene(state);
        return { completed: state.completed, snapshot: sceneSnapshot(state) };
    } finally {
        options.host.dispose();
    }
}

function createSceneExecutionState(script: SceneScript, options: ScenePlayOptions): SceneExecutionState {
    const restored = compatibleSnapshot(script, options.snapshot);
    return {
        script,
        options,
        labels: labelIndex(script),
        flags: { ...options.flags, ...restored.flags },
        choices: [...restored.choices],
        readLineIds: new Set(restored.readLineIds),
        cursor: restored.cursor,
        completed: false,
        steps: 0,
        guardLimit: Math.max(100, script.nodes.length * 50),
    };
}

async function runScene(state: SceneExecutionState): Promise<void> {
    while (sceneCanContinue(state)) {
        assertWithinControlFlowGuard(state);
        await executeSceneNode(state.script.nodes[state.cursor], state);
        await state.options.onCheckpoint?.(sceneSnapshot(state));
    }
}

function sceneCanContinue(state: SceneExecutionState): boolean {
    return state.cursor < state.script.nodes.length && !state.options.signal?.aborted;
}

function assertWithinControlFlowGuard(state: SceneExecutionState): void {
    state.steps += 1;
    if (state.steps > state.guardLimit) {
        throw new Error(`Scene ${state.script.id} exceeded its control-flow guard.`);
    }
}

async function executeSceneNode(node: SceneNode, state: SceneExecutionState): Promise<void> {
    const handlers = SCENE_NODE_HANDLERS as unknown as Readonly<Record<string, (
        value: SceneNode,
        execution: SceneExecutionState,
    ) => void | Promise<void>>>;
    const handler = Object.prototype.hasOwnProperty.call(handlers, node.kind)
        ? handlers[node.kind]
        : undefined;
    if (handler) await handler(node, state);
}

async function applySceneChoice(node: SceneChoice, state: SceneExecutionState): Promise<void> {
    const choiceId = await state.options.host.choice(node);
    const choice = node.options.find(option => option.id === choiceId);
    if (!choice) throw new Error(`Scene ${state.script.id} host returned unknown choice ${choiceId}.`);
    state.choices.push(choice.id);
    if (choice.set) Object.assign(state.flags, choice.set);
    state.cursor = choice.to
        ? requireLabel(state.labels, choice.to, state.script.id)
        : state.cursor + 1;
}

function advanceScene(state: SceneExecutionState): void {
    state.cursor += 1;
}

function sceneSnapshot(state: SceneExecutionState): SceneSnapshot {
    return {
        sceneId: state.script.id,
        revision: state.script.revision,
        cursor: state.cursor,
        flags: { ...state.flags },
        choices: [...state.choices],
        readLineIds: [...state.readLineIds],
    };
}

function validateScene(script: SceneScript): string[] {
    const issues: string[] = [];
    validateSceneEnvelope(script, issues);
    const labels = indexSceneNodes(script.nodes, issues);
    script.nodes.forEach(node => validateSceneNodeReferences(node, labels, issues));
    if (!script.nodes.some(node => node.kind === 'complete')) issues.push('scene has no complete node');
    return issues;
}

function validateSceneEnvelope(script: SceneScript, issues: string[]): void {
    if (!script.id.trim()) issues.push('missing scene id');
    if (!script.revision.trim()) issues.push('missing revision');
    if (!script.nodes.length) issues.push('empty node list');
}

function indexSceneNodes(nodes: readonly SceneNode[], issues: string[]): ReadonlySet<string> {
    const ids = new Set<string>();
    const labels = new Set<string>();
    nodes.forEach(node => indexSceneNode(node, ids, labels, issues));
    return labels;
}

function indexSceneNode(
    node: SceneNode,
    ids: Set<string>,
    labels: Set<string>,
    issues: string[],
): void {
    if (ids.has(node.id)) issues.push(`duplicate node id ${node.id}`);
    ids.add(node.id);
    indexSceneLabel(node, labels, issues);
    validateSceneNodeContent(node, issues);
}

function indexSceneLabel(node: SceneNode, labels: Set<string>, issues: string[]): void {
    if (node.kind !== 'label') return;
    if (labels.has(node.name)) issues.push(`duplicate label ${node.name}`);
    labels.add(node.name);
}

function validateSceneNodeContent(node: SceneNode, issues: string[]): void {
    if (node.kind === 'line' && !node.ja?.trim() && !node.en?.trim()) {
        issues.push(`line ${node.id} has no text`);
    }
    if (node.kind === 'choice' && !node.options.length) {
        issues.push(`choice ${node.id} has no options`);
    }
}

function validateSceneNodeReferences(
    node: SceneNode,
    labels: ReadonlySet<string>,
    issues: string[],
): void {
    validateDirectSceneTarget(node, labels, issues);
    if (node.kind === 'choice') validateSceneChoiceTargets(node, labels, issues);
}

function validateDirectSceneTarget(
    node: SceneNode,
    labels: ReadonlySet<string>,
    issues: string[],
): void {
    if (node.kind !== 'jump' && node.kind !== 'gate') return;
    if (!labels.has(node.to)) issues.push(`${node.kind} ${node.id} targets missing label ${node.to}`);
}

function validateSceneChoiceTargets(
    node: SceneChoice,
    labels: ReadonlySet<string>,
    issues: string[],
): void {
    const optionIds = new Set<string>();
    node.options.forEach(option => validateSceneChoiceOption(node, option, optionIds, labels, issues));
}

function validateSceneChoiceOption(
    node: SceneChoice,
    option: SceneChoiceOption,
    optionIds: Set<string>,
    labels: ReadonlySet<string>,
    issues: string[],
): void {
    if (optionIds.has(option.id)) issues.push(`choice ${node.id} repeats option ${option.id}`);
    optionIds.add(option.id);
    if (option.to && !labels.has(option.to)) {
        issues.push(`choice ${node.id} targets missing label ${option.to}`);
    }
}

function compatibleSnapshot(script: SceneScript, candidate?: SceneSnapshot): SceneSnapshot {
    if (candidate?.sceneId === script.id && candidate.revision === script.revision
        && Number.isSafeInteger(candidate.cursor) && candidate.cursor >= 0 && candidate.cursor <= script.nodes.length) {
        return structuredClone(candidate);
    }
    return { sceneId: script.id, revision: script.revision, cursor: 0, flags: {}, choices: [], readLineIds: [] };
}

function labelIndex(script: SceneScript): Map<string, number> {
    const labels = new Map<string, number>();
    script.nodes.forEach((node, index) => {
        if (node.kind === 'label') labels.set(node.name, index);
    });
    return labels;
}

function requireLabel(labels: ReadonlyMap<string, number>, name: string, sceneId: string): number {
    const index = labels.get(name);
    if (index === undefined) throw new Error(`Scene ${sceneId} is missing label ${name}.`);
    return index;
}

function gateMatches(value: SceneValue | undefined, gate: Extract<SceneNode, { kind: 'gate' }>): boolean {
    return gate.atLeast !== undefined
        ? typeof value === 'number' && value >= gate.atLeast
        : value === (gate.equals ?? true);
}
