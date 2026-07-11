/**
 * Yomu Academy VN engine — runtime.
 *
 * Interprets a SceneScript against a stage renderer. The runtime owns
 * control flow (labels, jumps, gates, choices, embedded exercises) and
 * script-local + world flags; the stage owns all presentation.
 */

import type {
    SceneChoice,
    SceneExercise,
    SceneLine,
    SceneNode,
    SceneRunResult,
    SceneScript,
    SceneStageDirection,
} from './script';

export interface StageAdapter {
    /** Apply a stage direction (plate/sprites/ambience). */
    direct(direction: SceneStageDirection): Promise<void>;
    /** Present one line; resolve when the learner advances. */
    line(line: SceneLine): Promise<void>;
    /** Present a choice; resolve with the picked option id. */
    choice(choice: SceneChoice): Promise<string>;
    /** Tear down any transient UI at scene end. */
    end(): void;
}

export type ExerciseHandler = (payload: unknown) => Promise<Record<string, string | number | boolean>>;

export interface RuntimeOptions {
    stage: StageAdapter;
    /** Pre-seeded flags (world state visible to gates). */
    flags?: Record<string, string | number | boolean>;
    exerciseHandlers?: Record<string, ExerciseHandler>;
    /** Called after every flag mutation, for autosave. */
    onFlagsChanged?: (flags: Record<string, string | number | boolean>) => void;
}

export async function runScene(script: SceneScript, options: RuntimeOptions): Promise<SceneRunResult> {
    const flags: Record<string, string | number | boolean> = { ...options.flags };
    const choices: string[] = [];
    const labelIndex = new Map<string, number>();
    script.nodes.forEach((node, index) => {
        if (node.kind === 'label') labelIndex.set(node.name, index);
    });

    const setFlags = (update: Record<string, string | number | boolean>) => {
        Object.assign(flags, update);
        options.onFlagsChanged?.(flags);
    };

    let position = 0;
    let completed = false;
    let guard = 0;
    const guardLimit = script.nodes.length * 50;

    while (position < script.nodes.length) {
        if (++guard > guardLimit) throw new Error(`scene ${script.id}: control-flow loop exceeded ${guardLimit} steps`);
        const node: SceneNode = script.nodes[position];
        switch (node.kind) {
            case 'label':
                position += 1;
                break;
            case 'jump':
                position = requireLabel(labelIndex, node.to, script.id);
                break;
            case 'gate': {
                const value = flags[node.flag];
                const matches = node.atLeast !== undefined
                    ? typeof value === 'number' && value >= node.atLeast
                    : value === (node.equals ?? true);
                position = matches ? requireLabel(labelIndex, node.to, script.id) : position + 1;
                break;
            }
            case 'set':
                setFlags(node.flags);
                position += 1;
                break;
            case 'stage':
                await options.stage.direct(node);
                position += 1;
                break;
            case 'line':
                await options.stage.line(node);
                position += 1;
                break;
            case 'choice': {
                const picked = await options.stage.choice(node);
                choices.push(picked);
                const option = node.options.find(candidate => candidate.id === picked);
                if (option?.set) setFlags(option.set);
                position = option?.to ? requireLabel(labelIndex, option.to, script.id) : position + 1;
                break;
            }
            case 'exercise': {
                const handler = options.exerciseHandlers?.[(node as SceneExercise).handler];
                if (!handler) throw new Error(`scene ${script.id}: no handler for exercise '${node.handler}'`);
                const outcome = await handler(node.payload);
                setFlags(outcome);
                position += 1;
                break;
            }
            case 'end':
                if (node.result) setFlags(node.result);
                completed = true;
                position = script.nodes.length;
                break;
        }
        if (completed) break;
    }

    options.stage.end();
    return { completed, flags, choices };
}

function requireLabel(labels: Map<string, number>, name: string, sceneId: string): number {
    const index = labels.get(name);
    if (index === undefined) throw new Error(`scene ${sceneId}: missing label '${name}'`);
    return index;
}
