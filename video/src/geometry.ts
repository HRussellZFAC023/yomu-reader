import { tokenLength, type Token } from './content';

export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * Where the baked-in dialogue actually sits in each 1920x1080 reference frame.
 *
 * These numbers were measured off the frames themselves (ffmpeg crop + grid) —
 * the game text is pixels, not DOM, so the annotation layer has to be told
 * where it is, exactly as the real overlay is told by the OCR engine's
 * bounding boxes. Re-measure if the frames are ever replaced.
 */
export interface LineMetrics {
    /** Left edge of the first character. */
    x: number;
    /** Top of the glyph band. */
    y: number;
    /** Per-character advance. CJK is monospaced in both frames. */
    advance: number;
    /** Glyph band height. */
    height: number;
}

export const SCENE_ONE_LINES: LineMetrics[] = [
    { x: 677.5, y: 895, advance: 35, height: 40 },
    { x: 677.5, y: 940, advance: 35, height: 40 },
];

export const SCENE_TWO_LINE: LineMetrics = { x: 682.5, y: 906, advance: 33.6, height: 40 };

/** The OCR region box the engine returns for a line, with a little breathing room. */
export function lineBox(metrics: LineMetrics, characterCount: number, padX = 12, padY = 9): Rect {
    return {
        left: metrics.x - padX,
        top: metrics.y - padY,
        width: characterCount * metrics.advance + padX * 2,
        height: metrics.height + padY * 2,
    };
}

export function lineCharacterCount(tokens: readonly Token[]): number {
    return tokens.reduce((total, token) => total + tokenLength(token), 0);
}

/** The bright rectangle the overlay keeps un-dimmed while it reads. */
export const SCENE_ONE_SPOTLIGHT: Rect = {
    left: 620,
    top: 862,
    width: 700,
    height: 140,
};

export const SCENE_TWO_SPOTLIGHT: Rect = {
    left: 640,
    top: 876,
    width: 620,
    height: 108,
};

/**
 * The crop that goes onto the mined note as the context screenshot: wide enough
 * to show the speaker's bubble and the scene it belongs to, not just the line.
 */
export const SCENE_ONE_THUMB: Rect = {
    left: 470,
    top: 690,
    width: 940,
    height: 390,
};

/**
 * Fixed positions for the Yomu chrome, chosen to miss the game's own chrome:
 * the date stamp owns the top-left, the oversized portrait owns the bottom-left
 * corner, and the game's control legend owns the bottom-right.
 */
export const LAYOUT = {
    card: { left: 1150, top: 206 },
    cardWidth: 640,
    deck: { left: 1520, top: 60 },
    legend: { left: 62, top: 918 },
    shortcut: { left: 556, top: 108 },
    /** The overlay's readable text layer, above the dialogue it was read from. */
    plate: { left: 300, top: 646 },
    plateTwo: { left: 330, top: 636 },
} as const;
