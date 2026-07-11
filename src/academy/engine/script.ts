/**
 * Yomu Academy VN engine — script model.
 *
 * A scene script is data, not code: an ordered node list with labels and
 * jumps. Japanese lines are structured (speaker, ja, en, notes) because
 * furigana, pitch, and translation toggles are first-class learning UI,
 * not string decoration.
 */

export type CharacterId = string;
export type ExpressionId =
    | 'neutral'
    | 'happy'
    | 'laughing'
    | 'thinking'
    | 'surprised'
    | 'concerned'
    | 'determined'
    | 'embarrassed'
    | 'speaking'
    | 'listening';

export type StageSide = 'left' | 'center' | 'right';

/** One dialogue line. `ja` may be absent for narration written in English. */
export interface SceneLine {
    kind: 'line';
    speaker?: CharacterId;
    expression?: ExpressionId;
    /** Japanese text; annotated by the Yomu runtime (furigana/pitch/lookup). */
    ja?: string;
    /** English text: the translation of `ja`, or the narration itself. */
    en?: string;
    /** Optional short learning note shown under the line when revealed. */
    note?: string;
}

export interface SceneChoiceOption {
    id: string;
    ja?: string;
    en: string;
    /** Label to jump to; omitted = fall through. */
    to?: string;
    /** State flags set when picked (e.g. remembered small decisions). */
    set?: Record<string, string | number | boolean>;
}

export interface SceneChoice {
    kind: 'choice';
    prompt?: SceneLine;
    options: SceneChoiceOption[];
}

/** Change the environment plate (background). */
export interface SceneStageDirection {
    kind: 'stage';
    /** Plate asset id resolved via the asset manifest. */
    plate?: string;
    /** Characters present after this direction (id order = layout order). */
    sprites?: { character: CharacterId; expression?: ExpressionId; side?: StageSide }[];
    /** Ambient audio cue id; 'silence' stops audio. */
    ambience?: string;
}

export interface SceneLabel {
    kind: 'label';
    name: string;
}

export interface SceneJump {
    kind: 'jump';
    to: string;
}

/** Conditional jump on script state (bond ranks, flags, knowledge gates). */
export interface SceneGate {
    kind: 'gate';
    flag: string;
    equals?: string | number | boolean;
    atLeast?: number;
    to: string;
}

export interface SceneSet {
    kind: 'set';
    flags: Record<string, string | number | boolean>;
}

/** Embed an interactive exercise; the runtime pauses until it resolves. */
export interface SceneExercise {
    kind: 'exercise';
    /** Handler id registered with the runtime (e.g. 'foundation-practice'). */
    handler: string;
    payload: unknown;
}

export interface SceneEnd {
    kind: 'end';
    /** Result flags reported to the caller (bond points, completion). */
    result?: Record<string, string | number | boolean>;
}

export type SceneNode =
    | SceneLine
    | SceneChoice
    | SceneStageDirection
    | SceneLabel
    | SceneJump
    | SceneGate
    | SceneSet
    | SceneExercise
    | SceneEnd;

export interface SceneScript {
    id: string;
    title?: string;
    /**
     * Language band this authored variant targets. Scenes may exist in
     * several variants of the same communicative intent (N5 → N4 → …);
     * the world picks the variant matching learner level.
     */
    band?: 'n5' | 'bridge' | 'n4' | 'n3' | 'n2' | 'n1';
    nodes: SceneNode[];
}

export interface SceneRunResult {
    completed: boolean;
    flags: Record<string, string | number | boolean>;
    /** ids of choice options the learner picked, in order. */
    choices: string[];
}

/** Validate script integrity: jump/gate targets exist, labels unique. */
export function validateScript(script: SceneScript): string[] {
    const errors: string[] = [];
    const labels = new Set<string>();
    for (const node of script.nodes) {
        if (node.kind === 'label') {
            if (labels.has(node.name)) errors.push(`duplicate label: ${node.name}`);
            labels.add(node.name);
        }
    }
    const checkTarget = (to: string | undefined, from: string) => {
        if (to && !labels.has(to)) errors.push(`${from} targets missing label: ${to}`);
    };
    for (const node of script.nodes) {
        if (node.kind === 'jump') checkTarget(node.to, 'jump');
        if (node.kind === 'gate') checkTarget(node.to, 'gate');
        if (node.kind === 'choice') for (const option of node.options) checkTarget(option.to, `choice option ${option.id}`);
    }
    if (!script.nodes.some(node => node.kind === 'end')) errors.push('script has no end node');
    return errors;
}
