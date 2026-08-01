import type { ReaderColorSource } from '../app/types';
import { DEFAULT_OVERLAY_BACKGROUND_COLOR, DEFAULT_OVERLAY_OUTLINE_COLOR, DEFAULT_OVERLAY_TEXT_COLOR, DEFAULT_SETTINGS, accentToRgba, sanitizeAccentColor } from './index';
import { COLOR_SOURCE_VALUES, CUSTOM_FONT_FAMILY_VALUE, readOption } from './form-read';

const COLOR_SOURCE_CLASS_VALUES: Exclude<ReaderColorSource, 'auto' | 'off'>[] = ['status', 'jpdb', 'anki', 'pitch'];

export function syncSubtitlePreview(form: HTMLFormElement): void {
    const preview = form.querySelector<HTMLElement>('[data-subtitle-preview]');
    if (!preview) return;
    const value = (name: string, fallback: string) => namedControl(form, name)?.value || fallback;
    const numberValue = (name: string, fallback: number) => {
        const number = Number(value(name, String(fallback)));
        return Number.isFinite(number) ? number : fallback;
    };
    preview.style.setProperty('--subtitle-font-size', `${Math.max(16, Math.min(64, numberValue('subtitleFontSize', 28)))}px`);
    preview.style.setProperty('--subtitle-color', sanitizeAccentColor(value('subtitleTextColor', DEFAULT_OVERLAY_TEXT_COLOR), DEFAULT_OVERLAY_TEXT_COLOR));
    preview.style.setProperty('--subtitle-outline', sanitizeAccentColor(value('subtitleOutlineColor', DEFAULT_OVERLAY_OUTLINE_COLOR), DEFAULT_OVERLAY_OUTLINE_COLOR));
    preview.style.setProperty(
        '--subtitle-background-rgba',
        accentToRgba(
            sanitizeAccentColor(value('subtitleBackgroundColor', DEFAULT_OVERLAY_BACKGROUND_COLOR), DEFAULT_OVERLAY_BACKGROUND_COLOR),
            Math.max(0, Math.min(1, numberValue('subtitleBackgroundOpacity', 0))),
        ),
    );
    preview.style.setProperty('--subtitle-family', formFontFamilyValue(form, 'subtitleFontFamily', 'system-ui'));
    preview.style.setProperty('--subtitle-weight', String(Math.max(100, Math.min(900, numberValue('subtitleFontWeight', 760)))));
    const nativeDisplay = value('subtitleNativeDisplay', 'blurred');
    const nativeBlurStrength = Math.max(4, Math.min(20, numberValue('subtitleNativeBlurStrength', DEFAULT_SETTINGS.subtitleNativeBlurStrength)));
    preview.style.setProperty('--subtitle-native-blur-radius', `${nativeBlurStrength}px`);
    preview.style.setProperty('--subtitle-native-blur-outer-radius', `${nativeBlurStrength + 4}px`);
    const nativePreview = preview.querySelector<HTMLElement>('.jpdb-subtitle-secondary');
    if (nativePreview) {
        nativePreview.hidden = nativeDisplay === 'hidden';
        nativePreview.classList.toggle('jpdb-subtitle-secondary-blurred', nativeDisplay === 'blurred');
        nativePreview.classList.toggle('jpdb-subtitle-secondary-clear', nativeDisplay === 'shown');
    }
    const nativeBlurStrengthField = namedControl(form, 'subtitleNativeBlurStrength')?.closest<HTMLElement>('label');
    if (nativeBlurStrengthField) nativeBlurStrengthField.hidden = nativeDisplay !== 'blurred';
    syncSubtitlePreviewColorClasses(form, preview);
}

function namedControl(form: HTMLFormElement, name: string): HTMLInputElement | HTMLSelectElement | null {
    return form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
}

function formFontFamilyValue(form: HTMLFormElement, name: string, fallback: string): string {
    const value = namedControl(form, name)?.value.trim() ?? '';
    if (value === CUSTOM_FONT_FAMILY_VALUE) return namedControl(form, `${name}Custom`)?.value.trim() || fallback;
    return value || fallback;
}

function syncSubtitlePreviewColorClasses(form: HTMLFormElement, preview: HTMLElement): void {
    const value = (name: string, fallback: string) => namedControl(form, name)?.value || fallback;
    const classes = {
        highlight: readOption(value('subtitleHighlightColorSource', 'jpdb'), COLOR_SOURCE_VALUES, 'jpdb'),
        underline: readOption(value('subtitleUnderlineColorSource', 'pitch'), COLOR_SOURCE_VALUES, 'pitch'),
        text: readOption(value('subtitleTextColorSource', 'jpdb'), COLOR_SOURCE_VALUES, 'jpdb'),
    };
    (Object.keys(classes) as Array<keyof typeof classes>).forEach(channel => {
        COLOR_SOURCE_CLASS_VALUES.forEach(source => {
            preview.classList.toggle(`jpdb-reader-subtitle-${channel}-${source}`, classes[channel] === source);
        });
    });
}
