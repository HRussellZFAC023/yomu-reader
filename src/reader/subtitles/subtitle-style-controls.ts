import { uiText } from '../app/i18n';
import type { ReaderSettings } from '../app/types';
import { DEFAULT_SETTINGS } from '../settings/index';
import {
    applyNativeSubtitleDisplayMode,
    isNativeSubtitleDisplayMode,
    nativeSubtitleDisplayMode,
} from './native-subtitle-display';
import { positionSubtitleStylePopover } from './subtitle-style-popover';
import {
    setStylePropertyIfChanged,
    SUBTITLE_STYLE_FONT_FAMILY_VALUES,
} from './subtitle-surface';
import {
    readSubtitleStyleControlCapability,
    readSubtitleStyleOptionCapability,
    type SubtitleStyleSetting,
} from '../dom/private-command-capabilities';

type SubtitleStyleNumberSetting =
    | 'subtitleNativeBlurStrength'
    | 'subtitleFontSize'
    | 'subtitleFontWeight'
    | 'subtitleBottomOffset'
    | 'subtitleBackgroundOpacity';

export interface SubtitleStyleControlValue {
    setting: SubtitleStyleSetting;
    value: string;
    checked?: boolean;
}

/** Resolves a genuine style change through private control/Option authority. */
export function subtitleStyleControlValueFromTarget(
    root: HTMLElement | undefined,
    eventTarget: EventTarget | null,
): SubtitleStyleControlValue | undefined {
    const target = subtitleStyleControlTarget(eventTarget);
    if (!subtitleStyleControlBelongsTo(root, target)) return undefined;
    const control = readSubtitleStyleControlCapability(target);
    if (!control) return undefined;
    if (target instanceof HTMLSelectElement) return selectedSubtitleStyleControl(target, control.setting);
    return { setting: control.setting, value: target.value, checked: target.checked };
}

function subtitleStyleControlBelongsTo(
    root: HTMLElement | undefined,
    target: HTMLInputElement | HTMLSelectElement | null,
): target is HTMLInputElement | HTMLSelectElement {
    return Boolean(target && root?.contains(target));
}

function subtitleStyleControlTarget(eventTarget: EventTarget | null): HTMLInputElement | HTMLSelectElement | null {
    if (!(eventTarget instanceof HTMLElement)) return null;
    return eventTarget.closest<HTMLInputElement | HTMLSelectElement>('[data-subtitle-style-setting]');
}

function selectedSubtitleStyleControl(
    target: HTMLSelectElement,
    setting: SubtitleStyleSetting,
): SubtitleStyleControlValue | undefined {
    const option = readSubtitleStyleOptionCapability(target.options[target.selectedIndex]);
    if (option?.setting !== setting) return undefined;
    return { setting, value: option.value };
}

type SubtitleStyleApplier = (settings: ReaderSettings, control: SubtitleStyleControlValue) => readonly (keyof ReaderSettings)[] | undefined;

const NATIVE_DISPLAY_EXPLICIT_KEYS = [
    'subtitleSecondaryVisible',
    'subtitleSecondaryVisibleChosen',
    'subtitleNativeBlurred',
] as const satisfies readonly (keyof ReaderSettings)[];

/**
 * The keys Reset WITHDRAWS intent for.
 *
 * Reset puts the shipped defaults back, which is the opposite of choosing them:
 * declaring these as choices pinned `subtitleSecondaryVisible: true` (the
 * default native-display mode is "blurred", i.e. visible) as though the learner
 * had asked for native subtitles, and that pin then reverted the next attempt to
 * turn them off.
 */
const RESET_WITHDRAWN_KEYS = [
    ...NATIVE_DISPLAY_EXPLICIT_KEYS,
    'subtitleNativeBlurStrength',
    'subtitleFontSize',
    'subtitleFontWeight',
    'subtitleBottomOffset',
    'subtitleBackgroundOpacity',
    'subtitleFontFamily',
    'subtitleMiningPause',
    'subtitleHoverPause',
] as const satisfies readonly (keyof ReaderSettings)[];

function updateNumberSetting(
    settings: ReaderSettings,
    key: SubtitleStyleNumberSetting,
    value: string,
    min: number,
    max: number,
): boolean {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return false;
    const next = Math.min(Math.max(parsed, min), max);
    const normalized = key === 'subtitleBackgroundOpacity' ? Number(next.toFixed(2)) : Math.round(next);
    if (settings[key] === normalized) return false;
    settings[key] = normalized;
    return true;
}

function numberStyleApplier(key: SubtitleStyleNumberSetting, min: number, max: number): SubtitleStyleApplier {
    return (settings, control) => updateNumberSetting(settings, key, control.value, min, max) ? [key] : undefined;
}

function booleanStyleApplier(key: 'subtitleHoverPause' | 'subtitleMiningPause'): SubtitleStyleApplier {
    return (settings, control) => {
        if (typeof control.checked !== 'boolean' || settings[key] === control.checked) return undefined;
        settings[key] = control.checked;
        return [key];
    };
}

const SUBTITLE_STYLE_APPLIERS: Record<SubtitleStyleSetting, SubtitleStyleApplier> = {
    subtitleNativeDisplay: (settings, control) => isNativeSubtitleDisplayMode(control.value) && applyNativeSubtitleDisplayMode(settings, control.value) ? NATIVE_DISPLAY_EXPLICIT_KEYS : undefined,
    subtitleNativeBlurStrength: numberStyleApplier('subtitleNativeBlurStrength', 4, 20),
    subtitleFontSize: numberStyleApplier('subtitleFontSize', 16, 64),
    subtitleFontWeight: numberStyleApplier('subtitleFontWeight', 300, 900),
    subtitleBackgroundOpacity: numberStyleApplier('subtitleBackgroundOpacity', 0, 0.7),
    subtitleFontFamily: (settings, control) => {
        const next = SUBTITLE_STYLE_FONT_FAMILY_VALUES.includes(control.value) ? control.value : settings.subtitleFontFamily;
        if (settings.subtitleFontFamily === next) return undefined;
        settings.subtitleFontFamily = next;
        return ['subtitleFontFamily'];
    },
    subtitleHoverPause: booleanStyleApplier('subtitleHoverPause'),
    subtitleMiningPause: booleanStyleApplier('subtitleMiningPause'),
};

/**
 * Applies one style-popover control and returns the settings keys that must be
 * protected from stale whole-settings writers. An undefined result means the
 * value was invalid or unchanged.
 */
export function applySubtitleStyleControl(
    settings: ReaderSettings,
    control: SubtitleStyleControlValue,
): readonly (keyof ReaderSettings)[] | undefined {
    return SUBTITLE_STYLE_APPLIERS[control.setting](settings, control);
}

/**
 * Resets the persisted style model and returns the keys whose recorded intent
 * must be withdrawn; the controller remains responsible for render side effects.
 */
export function resetSubtitleStyleSettings(
    settings: ReaderSettings,
): readonly (keyof ReaderSettings)[] | undefined {
    // markVisibilityChosen: false — restoring the default reveal mode is not the
    // learner deciding they want native subtitles.
    let changed = applyNativeSubtitleDisplayMode(settings, 'blurred', { markVisibilityChosen: false });
    const reset = <Key extends keyof ReaderSettings>(key: Key): void => {
        if (settings[key] === DEFAULT_SETTINGS[key]) return;
        settings[key] = DEFAULT_SETTINGS[key];
        changed = true;
    };
    reset('subtitleSecondaryVisibleChosen');
    reset('subtitleNativeBlurStrength');
    reset('subtitleFontSize');
    reset('subtitleFontWeight');
    reset('subtitleBottomOffset');
    reset('subtitleBackgroundOpacity');
    reset('subtitleFontFamily');
    reset('subtitleMiningPause');
    reset('subtitleHoverPause');
    return changed ? RESET_WITHDRAWN_KEYS : undefined;
}

export function syncNativeSubtitleBlurVariables(
    surfaces: readonly (HTMLElement | undefined)[],
    strength: number,
): void {
    for (const surface of surfaces) {
        if (!surface) continue;
        setStylePropertyIfChanged(surface, '--subtitle-native-blur-radius', `${strength}px`);
        setStylePropertyIfChanged(surface, '--subtitle-native-blur-outer-radius', `${strength + 4}px`);
    }
}

function syncRangeControl(
    root: HTMLElement,
    key: SubtitleStyleNumberSetting,
    value: number,
    suffix: 'px' | '%' | 'weight' | '',
): void {
    const control = root.querySelector<HTMLInputElement>(`[data-subtitle-style-setting="${key}"]`);
    const nextValue = key === 'subtitleBackgroundOpacity' ? String(Number(value.toFixed(2))) : String(Math.round(value));
    if (control && control.value !== nextValue) control.value = nextValue;
    const output = root.querySelector<HTMLOutputElement>(`[data-subtitle-style-output="${key}"]`);
    if (!output) return;
    if (suffix === 'weight') output.textContent = String(Math.round(value));
    else output.textContent = suffix ? `${Math.round(value)}${suffix}` : `${Math.round(value * 100)}%`;
}

/** Synchronizes the compact style popover without owning its open/close lifecycle. */
export function syncSubtitleStylePopoverControls(
    root: HTMLElement,
    settings: ReaderSettings,
    requestedOpen: boolean,
): void {
    const open = requestedOpen && settings.subtitleControlsMode !== 'hidden';
    root.classList.toggle('jpdb-subtitle-style-open', open);
    const button = root.querySelector<HTMLButtonElement>('[data-action="style"]');
    if (button) {
        const label = uiText(settings.interfaceLanguage, 'subtitleStyle');
        button.title = label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-expanded', String(open));
    }
    const popover = root.querySelector<HTMLElement>('[data-subtitle-style-popover]');
    if (!popover) return;
    popover.hidden = !open;
    const nativeDisplay = nativeSubtitleDisplayMode(settings);
    const nativeDisplaySelect = popover.querySelector<HTMLSelectElement>('[data-subtitle-style-setting="subtitleNativeDisplay"]');
    if (nativeDisplaySelect && nativeDisplaySelect.value !== nativeDisplay) nativeDisplaySelect.value = nativeDisplay;
    const nativeBlurStrengthField = popover.querySelector<HTMLElement>('[data-subtitle-style-field="subtitleNativeBlurStrength"]');
    if (nativeBlurStrengthField) nativeBlurStrengthField.hidden = nativeDisplay !== 'blurred';
    syncRangeControl(popover, 'subtitleNativeBlurStrength', settings.subtitleNativeBlurStrength, 'px');
    syncRangeControl(popover, 'subtitleFontSize', settings.subtitleFontSize, 'px');
    syncRangeControl(popover, 'subtitleFontWeight', settings.subtitleFontWeight, 'weight');
    syncRangeControl(popover, 'subtitleBackgroundOpacity', settings.subtitleBackgroundOpacity, '');
    const fontSelect = popover.querySelector<HTMLSelectElement>('[data-subtitle-style-setting="subtitleFontFamily"]');
    if (fontSelect && fontSelect.value !== settings.subtitleFontFamily) fontSelect.value = settings.subtitleFontFamily;
    const hoverPause = popover.querySelector<HTMLInputElement>('[data-subtitle-style-setting="subtitleHoverPause"]');
    if (hoverPause) hoverPause.checked = settings.subtitleHoverPause;
    const miningPause = popover.querySelector<HTMLInputElement>('[data-subtitle-style-setting="subtitleMiningPause"]');
    if (miningPause) miningPause.checked = settings.subtitleMiningPause;
    const rail = root.querySelector<HTMLElement>('.jpdb-subtitle-rail');
    if (open && rail) positionSubtitleStylePopover(popover, rail);
}
