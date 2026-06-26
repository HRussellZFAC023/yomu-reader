import { DEFAULT_POPUP_FONT_FAMILY, DEFAULT_READER_FONT_FAMILY } from './index';

export type FontPresetLabelKey =
    | 'fontPresetYomuDefault'
    | 'fontPresetJapaneseSans'
    | 'fontPresetHiraginoYuGothic'
    | 'fontPresetJapaneseRounded'
    | 'fontPresetJapaneseSerif'
    | 'fontPresetSystemUi';

export interface FontFamilyPreset {
    value: string;
    labelKey: FontPresetLabelKey;
    fallbackLabel: string;
}

export const JAPANESE_SANS_FONT_FAMILY = '"Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
export const HIRAGINO_YU_GOTHIC_FONT_FAMILY = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
export const JAPANESE_ROUNDED_FONT_FAMILY = '"Hiragino Maru Gothic ProN", "Yu Gothic", "Noto Sans JP", Meiryo, sans-serif';
export const JAPANESE_SERIF_FONT_FAMILY = '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", YuMincho, serif';

export const FONT_FAMILY_PRESETS = [
    { value: DEFAULT_POPUP_FONT_FAMILY, labelKey: 'fontPresetYomuDefault', fallbackLabel: 'Built-in font' },
    { value: JAPANESE_SANS_FONT_FAMILY, labelKey: 'fontPresetJapaneseSans', fallbackLabel: 'Japanese sans' },
    { value: HIRAGINO_YU_GOTHIC_FONT_FAMILY, labelKey: 'fontPresetHiraginoYuGothic', fallbackLabel: 'Hiragino / Yu Gothic' },
    { value: JAPANESE_ROUNDED_FONT_FAMILY, labelKey: 'fontPresetJapaneseRounded', fallbackLabel: 'Japanese rounded' },
    { value: JAPANESE_SERIF_FONT_FAMILY, labelKey: 'fontPresetJapaneseSerif', fallbackLabel: 'Japanese serif' },
    { value: DEFAULT_READER_FONT_FAMILY, labelKey: 'fontPresetSystemUi', fallbackLabel: 'System UI' },
] as const satisfies readonly FontFamilyPreset[];
