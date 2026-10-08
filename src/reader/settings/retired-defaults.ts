import type { ReaderSettings } from '../app/types';
import { hasOwn } from './values';
import type { SettingsIntentLedger } from './intent-ledger';

/**
 * Defaults a release replaced, and the values they used to be.
 *
 * Every save persists the whole settings object, so a learner who never
 * touched a control still has the old default written down, and changing
 * DEFAULT_SETTINGS alone would only reach fresh installs. A group of stored
 * values that still equals a retired default AND has no declaration in the
 * intent ledger is a carried-along default, so it reads as today's default.
 * A declared key, or a group holding any value the old default never had, is
 * the learner's configuration and stays whole.
 *
 * Keys that only make sense together are one group: a colour channel set the
 * learner changed in one place (pitch highlight beside the old pitch
 * underline) must not be half-replaced into a combination nobody chose.
 *
 * The ledger is what makes this safe (intent-ledger.ts): a value alone cannot
 * say whether a human chose it, but a control a human moved declares its key,
 * and that declaration outranks this projection. A backup carries the ledger
 * beside the settings, so a restored choice stays a choice.
 *
 * 2.1 annotation defaults (ADR-0025): nothing painted behind a word at rest,
 * the underline carries study state instead of pitch, known and ignored words
 * stay plain, and readings follow what the learner knows: known and due words
 * lose theirs, a word the learner just failed keeps it.
 */
// 'auto' meant 'all' until known-status replaced it.
const RETIRED_READING_MODES: readonly unknown[] = ['all', 'auto'];

const RETIRED_SETTING_DEFAULTS: ReadonlyArray<{
    readonly keys: readonly (keyof ReaderSettings)[];
    readonly retired: readonly (readonly unknown[])[];
}> = [
    { keys: ['furiganaMode'], retired: RETIRED_READING_MODES.map(mode => [mode]) },
    // The mode the puck brings back when furigana is shown again.
    { keys: ['puckFuriganaModeBeforeHide'], retired: RETIRED_READING_MODES.map(mode => [mode]) },
    // A word the learner just failed keeps its reading.
    { keys: ['furiganaHiddenStateGroups'], retired: [[['known', 'due', 'failed']]] },
    { keys: ['wordHighlightColorSource', 'wordUnderlineColorSource', 'wordTextColorSource'], retired: [['jpdb', 'pitch', 'anki']] },
    { keys: ['subtitleHighlightColorSource', 'subtitleUnderlineColorSource', 'subtitleTextColorSource'], retired: [['jpdb', 'pitch', 'anki']] },
    { keys: ['wordColorHiddenStateGroups'], retired: [[[]]] },
];

export const RETIRED_DEFAULT_SETTING_KEYS: readonly (keyof ReaderSettings)[] = RETIRED_SETTING_DEFAULTS.flatMap(group => group.keys);

export function adoptCurrentDefaults(
    settings: ReaderSettings,
    ledger: SettingsIntentLedger,
    defaults: ReaderSettings,
): ReaderSettings {
    let next: ReaderSettings | null = null;
    for (const { keys, retired } of RETIRED_SETTING_DEFAULTS) {
        if (keys.some(key => hasOwn(ledger.records, key))) continue;
        if (!retired.some(values => keys.every((key, index) => sameValue(values[index], settings[key])))) continue;
        next ??= { ...settings };
        for (const key of keys) (next as unknown as Record<string, unknown>)[key] = structuredClone(defaults[key]);
    }
    return next ?? settings;
}

/**
 * The puck's reading-mode declarations from before 2.1, which are no choice.
 *
 * Showing furigana again through the 2.0 puck declared the mode it switched
 * to, the then-default 'all' included, and hiding declared the mode to come
 * back to the same way, so a learner who only ever pressed the puck has 'all'
 * declared as if chosen. That write declared the remembered mode right after
 * the reading mode, one sequence number apart. Since 2.1 the puck declares the
 * remembered mode first (app/annotation-power-policy.ts,
 * PUCK_FURIGANA_INTENT_KEYS), so that order marks a 2.0 puck write, and a
 * retired mode it declared is dropped from the ledger: the setting then reads
 * as today's default, and the next save stores the ledger without it.
 */
export function retirePuckDefaultDeclarations(ledger: SettingsIntentLedger): SettingsIntentLedger {
    const mode = ledger.records.furiganaMode;
    const remembered = ledger.records.puckFuriganaModeBeforeHide;
    if (!mode || !remembered || remembered.seq !== mode.seq + 1) return ledger;
    const retired = (['furiganaMode', 'puckFuriganaModeBeforeHide'] as const)
        .filter(key => RETIRED_READING_MODES.includes(ledger.records[key]!.value));
    if (!retired.length) return ledger;
    const records = { ...ledger.records };
    for (const key of retired) delete records[key];
    return { revision: ledger.revision, records };
}

// Hidden-group lists are sets: the form writes them in its own order.
function sameValue(left: unknown, right: unknown): boolean {
    if (Array.isArray(left) && Array.isArray(right)) return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
    return left === right || JSON.stringify(left) === JSON.stringify(right);
}
