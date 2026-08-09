import { CARD_STATE_LABEL_KEYS, uiText } from '../app/i18n';
import { FURIGANA_HIDE_STATE_GROUPS, WORD_COLOR_HIDE_STATE_GROUPS } from '../app/constants';
import { escapeHtml } from '../dom/html';
import { checkbox } from './form-controls';
import { effectiveFuriganaMode } from './index';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import type { LearningTargetRosterId } from '../languages';

// Same local alias the other settings modules use; there is no shared export.
type SettingsTextKey = Parameters<typeof uiText>[1];

/**
 * The two "hide X for these word states" checkbox groups, and the label map that
 * relocalises them on a live interface-language switch.
 *
 * Lives outside form.ts because that file is one of the ones every settings change
 * ripples through, and because keeping both groups side by side is what makes the
 * asymmetry between them legible: furigana has five state groups, colour has those
 * five plus the ignored/suspended/blacklisted family. Colour originally reused the
 * furigana list verbatim, so that family had a colour and a picker but no switch —
 * a learner with the common particles and Kaishi 1.5k blacklisted had almost every
 * word on the page coloured with no way to turn it off (GitHub #37).
 */

export function renderReadingHiddenStateGroupControls(
    settings: ReaderSettings,
    targetLanguage: LearningTargetRosterId,
): string {
    const language = settings.interfaceLanguage;
    const selected = new Set(settings.furiganaHiddenStateGroups);
    const boxes = FURIGANA_HIDE_STATE_GROUPS
        .map(group => checkbox(`furiganaHide-${group}`, uiText(language, CARD_STATE_LABEL_KEYS[group]), selected.has(group)))
        .join('');
    const hidden = effectiveFuriganaMode(settings) === 'known-status' ? '' : ' hidden';
    const legendKey = targetLanguage === 'ja' ? 'hideFuriganaFor' : 'hideReadingsFor';
    return `<fieldset class="jpdb-reader-radio-group" data-furigana-hide-groups${hidden}><legend>${escapedUiText(language, legendKey)}</legend>${boxes}</fieldset>`;
}

/**
 * The colour analogue. Always shown in the colour subsection: it stays meaningful
 * whenever any colour channel is active. The ignored family gets ONE switch rather
 * than three, because those three states already share one colour behind one
 * picker — three checkboxes would promise control the colour layer cannot express —
 * and it borrows that picker's own label so both controls name the same thing.
 */
export function renderWordColorHiddenStateGroupControls(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    const selected = new Set(settings.wordColorHiddenStateGroups);
    const boxes = WORD_COLOR_HIDE_STATE_GROUPS
        .map(group => checkbox(
            `colorHide-${group}`,
            uiText(language, group === 'ignored' ? 'wordColorIgnored' : CARD_STATE_LABEL_KEYS[group]),
            selected.has(group),
        ))
        .join('');
    return `<fieldset class="jpdb-reader-radio-group" data-word-color-hide-groups><legend>${escapedUiText(language, 'hideColorFor')}</legend>${boxes}</fieldset>`;
}

/**
 * Control-name to copy-key pairs for every checkbox above, so a live language
 * switch relocalises them. The ignored switch has no furigana twin and takes its
 * label from the colour picker rather than a card-state name.
 */
export const HIDE_STATE_GROUP_CONTROL_LABELS: readonly (readonly [string, SettingsTextKey])[] = [
    ...FURIGANA_HIDE_STATE_GROUPS.flatMap(group => {
        const key = CARD_STATE_LABEL_KEYS[group];
        return [
            [`furiganaHide-${group}`, key],
            [`colorHide-${group}`, key],
        ] as const satisfies readonly (readonly [string, SettingsTextKey])[];
    }),
    ['colorHide-ignored', 'wordColorIgnored'],
];

function escapedUiText(language: InterfaceLanguage, key: Parameters<typeof uiText>[1]): string {
    return escapeHtml(uiText(language, key));
}
