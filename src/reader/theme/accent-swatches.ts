import { BRAND_COLOR_TOKENS } from './brand-color-tokens';

// The curated accents Settings offers before the custom picker: ink, paper and
// red, with traditional Japanese colour names and no green. Each keeps
// text-on-accent at AA in both themes (tests/reader/accent-swatch-contrast).
export const ACCENT_SWATCHES = [
    { id: 'kurenai', color: BRAND_COLOR_TOKENS.accent, labelKey: 'accentSwatchKurenai' },
    { id: 'shu', color: '#bf4a12', labelKey: 'accentSwatchShu' },
    { id: 'ai', color: '#1f4f8f', labelKey: 'accentSwatchAi' },
    { id: 'murasaki', color: '#884898', labelKey: 'accentSwatchMurasaki' },
    { id: 'yamabuki', color: '#f8b500', labelKey: 'accentSwatchYamabuki' },
    { id: 'sumi', color: '#595857', labelKey: 'accentSwatchSumi' },
] as const;

export type AccentSwatch = typeof ACCENT_SWATCHES[number];

export function accentSwatchForColor(color: string): AccentSwatch | undefined {
    const normalized = color.trim().toLowerCase();
    return ACCENT_SWATCHES.find(swatch => swatch.color === normalized);
}
