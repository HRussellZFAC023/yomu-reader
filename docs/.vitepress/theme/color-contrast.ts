import { sharedContrastRatio } from '../../../src/reader/core/color-math';

export const DOC_COLOR_TOKENS = {
    black: '#000000',
    white: '#ffffff',
    readableInk: '#11161d',
    pageBgDark: '#181b20',
    pageBgLight: '#ffffff',
} as const;

const TEXT_CONTRAST = 4.5;

export function readableTextOn(background: string): string {
    const inkContrast = sharedContrastRatio(background, DOC_COLOR_TOKENS.readableInk);
    const whiteContrast = sharedContrastRatio(background, DOC_COLOR_TOKENS.white);
    const preferred = inkContrast >= whiteContrast ? DOC_COLOR_TOKENS.readableInk : DOC_COLOR_TOKENS.white;
    if (Math.max(inkContrast, whiteContrast) >= TEXT_CONTRAST) return preferred;

    const blackContrast = sharedContrastRatio(background, DOC_COLOR_TOKENS.black);
    return blackContrast >= whiteContrast ? DOC_COLOR_TOKENS.black : DOC_COLOR_TOKENS.white;
}
