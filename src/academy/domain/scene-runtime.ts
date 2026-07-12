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

async function playScene(script: SceneScript, options: ScenePlayOptions): Promise<SceneResult> {
    const issues = validateScene(script);
    if (issues.length) throw new Error(`Scene ${script.id} is invalid: ${issues.join('; ')}`);
    const labels = labelIndex(script);
    const restored = compatibleSnapshot(script, options.snapshot);
    const flags: Record<string, SceneValue> = { ...options.flags, ...restored.flags };
    const choices = [...restored.choices];
    const readLineIds = new Set(restored.readLineIds);
    let cursor = restored.cursor;
    let completed = false;
    let steps = 0;
    const guardLimit = Math.max(100, script.nodes.length * 50);

    const snapshot = (): SceneSnapshot => ({
        sceneId: script.id,
        revision: script.revision,
        cursor,
        flags: { ...flags },
        choices: [...choices],
        readLineIds: [...readLineIds],
    });
    const checkpoint = async (): Promise<void> => options.onCheckpoint?.(snapshot());

    try {
        while (cursor < script.nodes.length && !options.signal?.aborted) {
            if (++steps > guardLimit) throw new Error(`Scene ${script.id} exceeded its control-flow guard.`);
            const node = script.nodes[cursor];
            switch (node.kind) {
                case 'label':
                    cursor += 1;
                    break;
                case 'jump':
                    cursor = requireLabel(labels, node.to, script.id);
                    break;
                case 'gate':
                    cursor = gateMatches(flags[node.flag], node)
                        ? requireLabel(labels, node.to, script.id)
                        : cursor + 1;
                    break;
                case 'set':
                    Object.assign(flags, node.flags);
                    cursor += 1;
                    break;
                case 'stage':
                    await options.host.direct(node);
                    cursor += 1;
                    break;
                case 'line':
                    await options.host.line(node);
                    readLineIds.add(node.id);
                    cursor += 1;
                    break;
                case 'choice': {
                    const choiceId = await options.host.choice(node);
                    const choice = node.options.find(option => option.id === choiceId);
                    if (!choice) throw new Error(`Scene ${script.id} host returned unknown choice ${choiceId}.`);
                    choices.push(choice.id);
                    if (choice.set) Object.assign(flags, choice.set);
                    cursor = choice.to ? requireLabel(labels, choice.to, script.id) : cursor + 1;
                    break;
                }
                case 'activity':
                    Object.assign(flags, await options.host.activity(node));
                    cursor += 1;
                    break;
                case 'complete':
                    if (node.result) Object.assign(flags, node.result);
                    cursor = script.nodes.length;
                    completed = true;
                    await options.host.finish();
                    break;
            }
            await checkpoint();
        }
        return { completed, snapshot: snapshot() };
    } finally {
        options.host.dispose();
    }
}

export function validateScene(script: SceneScript): string[] {
    const issues: string[] = [];
    if (!script.id.trim()) issues.push('missing scene id');
    if (!script.revision.trim()) issues.push('missing revision');
    if (!script.nodes.length) issues.push('empty node list');
    const ids = new Set<string>();
    const labels = new Set<string>();
    for (const node of script.nodes) {
        if (ids.has(node.id)) issues.push(`duplicate node id ${node.id}`);
        ids.add(node.id);
        if (node.kind === 'label') {
            if (labels.has(node.name)) issues.push(`duplicate label ${node.name}`);
            labels.add(node.name);
        }
        if (node.kind === 'line' && !node.ja?.trim() && !node.en?.trim()) issues.push(`line ${node.id} has no text`);
        if (node.kind === 'choice' && !node.options.length) issues.push(`choice ${node.id} has no options`);
    }
    for (const node of script.nodes) {
        if ((node.kind === 'jump' || node.kind === 'gate') && !labels.has(node.to)) issues.push(`${node.kind} ${node.id} targets missing label ${node.to}`);
        if (node.kind === 'choice') {
            const optionIds = new Set<string>();
            for (const option of node.options) {
                if (optionIds.has(option.id)) issues.push(`choice ${node.id} repeats option ${option.id}`);
                optionIds.add(option.id);
                if (option.to && !labels.has(option.to)) issues.push(`choice ${node.id} targets missing label ${option.to}`);
            }
        }
    }
    if (!script.nodes.some(node => node.kind === 'complete')) issues.push('scene has no complete node');
    return issues;
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
