import { escapeHtml } from '../dom/index';
import type { ReaderSettings } from '../app/types';
import { ACCENT_SWATCHES, accentSwatchForColor } from '../theme/accent-swatches';
import { sanitizeAccentColor } from './color-settings';
import { settingsColorSourceValue } from './form-read';
import type { SettingsText } from './settings-text';

/**
 * The first row of Settings → Appearance: six curated accents plus the native
 * colour picker, and one Underline choice that sets the page and subtitle
 * underline channels together. The per-channel selects stay in Tuning and stay
 * the saved fields; this row only drives them, so Save and Cancel are unchanged.
 */
const UNDERLINE_CHANNELS = ['wordUnderlineColorSource', 'subtitleUnderlineColorSource'] as const;
const UNDERLINE_CHOICES = [
    ['status', 'underlineQuickStatus'],
    ['pitch', 'underlineQuickPitch'],
    ['off', 'off'],
] as const;
type UnderlineChoice = typeof UNDERLINE_CHOICES[number][0];

export interface AppearanceQuickRowActions {
    /** Applies and publishes an accent at once, as a finished colour pick does. */
    commitAccent: (color: string) => void;
}

export function renderAppearanceQuickRow(settings: ReaderSettings, text: SettingsText): string {
    const accent = sanitizeAccentColor(settings.accentColor);
    const preset = accentSwatchForColor(accent);
    const underline = underlineChoice(
        settingsColorSourceValue(settings, 'wordUnderlineColorSource'),
        settingsColorSourceValue(settings, 'subtitleUnderlineColorSource'),
    );
    const swatches = ACCENT_SWATCHES.map(swatch => {
        const name = escapeHtml(text(swatch.labelKey));
        return `<input class="jpdb-reader-swatch" type="radio" name="accentSwatch" value="${swatch.color}" style="--swatch: ${swatch.color}" aria-label="${name}" title="${name}" data-accent-swatch="${swatch.id}"${swatch === preset ? ' checked' : ''}>`;
    }).join('');
    const custom = escapeHtml(text('accentSwatchCustom'));
    const segments = UNDERLINE_CHOICES.map(([value, key]) =>
        `<label class="jpdb-reader-segment"><input type="radio" name="underlineQuick" value="${value}"${value === underline ? ' checked' : ''}><span data-underline-quick-label="${key}">${escapeHtml(text(key))}</span></label>`,
    ).join('');
    return `
                <div class="jpdb-reader-appearance-quick" data-appearance-quick>
                    <div class="jpdb-reader-quick-field">
                        <span class="jpdb-reader-quick-title" id="jpdb-reader-accent-title" data-quick-title="accentColor">${escapeHtml(text('accentColor'))}</span>
                        <span class="jpdb-reader-swatches">
                            <span class="jpdb-reader-swatch-set" role="radiogroup" aria-labelledby="jpdb-reader-accent-title" data-accent-swatches>${swatches}</span>
                            <input class="jpdb-reader-swatch jpdb-reader-swatch-custom" type="color" name="accentColor" value="${accent}" aria-label="${custom}" title="${custom}" data-accent-custom${preset ? '' : ' data-active'}>
                        </span>
                    </div>
                    <div class="jpdb-reader-quick-field">
                        <span class="jpdb-reader-quick-title" id="jpdb-reader-underline-title" data-quick-title="underlineQuick">${escapeHtml(text('underlineQuick'))}</span>
                        <span class="jpdb-reader-segmented" role="radiogroup" aria-labelledby="jpdb-reader-underline-title" data-underline-quick>${segments}</span>
                    </div>
                </div>`;
}

export function bindAppearanceQuickRow(form: HTMLFormElement, actions: AppearanceQuickRowActions): void {
    const custom = form.querySelector<HTMLInputElement>('input[name="accentColor"][data-accent-custom]');
    if (!custom) return;
    form.querySelectorAll<HTMLInputElement>('input[name="accentSwatch"]').forEach(swatch => {
        swatch.addEventListener('change', () => {
            if (!swatch.checked) return;
            custom.value = swatch.value;
            syncAccentSwatches(form);
            actions.commitAccent(swatch.value);
        });
    });
    custom.addEventListener('input', () => syncAccentSwatches(form));
    custom.addEventListener('change', () => syncAccentSwatches(form));
    form.querySelectorAll<HTMLInputElement>('input[name="underlineQuick"]').forEach(choice => {
        choice.addEventListener('change', () => {
            if (choice.checked) setUnderlineChannels(form, choice.value as UnderlineChoice);
        });
    });
    // Tuning edits and appearance presets write the channel selects directly;
    // the row then shows the shared choice, or none when the channels differ.
    form.addEventListener('change', event => {
        if (UNDERLINE_CHANNELS.some(name => (event.target as HTMLSelectElement | null)?.name === name)
            || (event.target as HTMLSelectElement | null)?.name === 'appearancePreset') syncUnderlineQuick(form);
    });
}

export function localizeAppearanceQuickRow(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll<HTMLElement>('[data-quick-title]').forEach(title => {
        title.textContent = text(title.dataset.quickTitle as 'accentColor' | 'underlineQuick');
    });
    ACCENT_SWATCHES.forEach(swatch => {
        const input = form.querySelector<HTMLInputElement>(`[data-accent-swatch="${swatch.id}"]`);
        if (input) setAccessibleName(input, text(swatch.labelKey));
    });
    const custom = form.querySelector<HTMLInputElement>('[data-accent-custom]');
    if (custom) setAccessibleName(custom, text('accentSwatchCustom'));
    form.querySelectorAll<HTMLElement>('[data-underline-quick-label]').forEach(label => {
        label.textContent = text(label.dataset.underlineQuickLabel as typeof UNDERLINE_CHOICES[number][1]);
    });
}

/** Re-reads the accent input and the channel selects after they were set without events. */
export function syncAppearanceQuickRow(form: HTMLFormElement): void {
    syncAccentSwatches(form);
    syncUnderlineQuick(form);
}

function setAccessibleName(element: HTMLElement, name: string): void {
    element.setAttribute('aria-label', name);
    element.title = name;
}

function syncAccentSwatches(form: HTMLFormElement): void {
    const custom = form.querySelector<HTMLInputElement>('input[name="accentColor"][data-accent-custom]');
    if (!custom) return;
    const preset = accentSwatchForColor(custom.value);
    form.querySelectorAll<HTMLInputElement>('input[name="accentSwatch"]').forEach(swatch => {
        swatch.checked = swatch.dataset.accentSwatch === preset?.id;
    });
    custom.toggleAttribute('data-active', !preset);
}

function setUnderlineChannels(form: HTMLFormElement, choice: UnderlineChoice): void {
    for (const name of UNDERLINE_CHANNELS) {
        const select = form.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
        if (!select || select.value === choice) continue;
        select.value = choice;
        // The live preview, the Save state and Tuning all listen for this.
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

function syncUnderlineQuick(form: HTMLFormElement): void {
    const [word, subtitle] = UNDERLINE_CHANNELS.map(name =>
        form.querySelector<HTMLSelectElement>(`select[name="${name}"]`)?.value ?? '');
    const choice = underlineChoice(word, subtitle);
    form.querySelectorAll<HTMLInputElement>('input[name="underlineQuick"]').forEach(input => {
        input.checked = input.value === choice;
    });
}

function underlineChoice(word: string, subtitle: string): UnderlineChoice | undefined {
    return word === subtitle ? UNDERLINE_CHOICES.find(([value]) => value === word)?.[0] : undefined;
}
