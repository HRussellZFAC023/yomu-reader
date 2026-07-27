import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { tokenLength, type Token } from '../content';
import type { Rect } from '../geometry';
import { font, palette, stateColor, tilt } from '../theme';

/**
 * The overlay's readable text layer.
 *
 * Annotating the game's own pixels in place was the first instinct and it does
 * not survive contact with the footage: the dialogue lines are 45px apart with
 * 40px glyphs, which leaves no room for furigana above a line or a status tint
 * below it without landing on the neighbouring line. The real overlay does not
 * have to work in that gap either — it recognises the text and renders its own
 * copy, which is what you actually point at and click. So the clip shows the
 * source text boxed where it lives, and Yomu's typeset reading of it on a plate
 * directly above, with room for ruby and tints.
 *
 * Layout is on a fixed character grid rather than natural text flow so that
 * plateTokenRect below and the rendered glyphs cannot drift apart — the cursor
 * has to land on the same word the viewer sees highlighted.
 */
export const PLATE = {
    fontSize: 44,
    rubySize: 21,
    rubyBand: 27,
    textBand: 54,
    tintGap: 7,
    tintHeight: 6,
    lineGap: 14,
    padX: 36,
    padY: 26,
} as const;

export const PLATE_LINE_HEIGHT = PLATE.rubyBand + PLATE.textBand + PLATE.tintGap + PLATE.tintHeight;

export interface PlateOrigin {
    left: number;
    top: number;
}

export function plateWidth(lines: readonly (readonly Token[])[]): number {
    const widest = Math.max(...lines.map(line => line.reduce((total, token) => total + tokenLength(token), 0)));
    return PLATE.padX * 2 + widest * PLATE.fontSize;
}

export function plateHeight(lines: readonly (readonly Token[])[]): number {
    return PLATE.padY * 2 + lines.length * PLATE_LINE_HEIGHT + (lines.length - 1) * PLATE.lineGap;
}

/** Where a given token lands on screen, in the same grid the plate renders on. */
export function plateTokenRect(
    origin: PlateOrigin,
    lines: readonly (readonly Token[])[],
    lineIndex: number,
    tokenIndex: number,
): Rect {
    const line = lines[lineIndex];
    if (!line) throw new Error(`Plate line ${lineIndex} does not exist.`);
    let characters = 0;
    for (let index = 0; index < tokenIndex; index++) {
        const token = line[index];
        if (token) characters += tokenLength(token);
    }
    const token = line[tokenIndex];
    return {
        left: origin.left + PLATE.padX + characters * PLATE.fontSize,
        top: origin.top + PLATE.padY + lineIndex * (PLATE_LINE_HEIGHT + PLATE.lineGap) + PLATE.rubyBand,
        width: (token ? tokenLength(token) : 0) * PLATE.fontSize,
        height: PLATE.textBand,
    };
}

/** Index of the token flagged as the clip's mining target. */
export function plateTargetIndex(lines: readonly (readonly Token[])[]): { line: number; token: number } {
    for (const [line, tokens] of lines.entries()) {
        const token = tokens.findIndex(candidate => candidate.target);
        if (token >= 0) return { line, token };
    }
    throw new Error('No target token on the plate.');
}

const TokenCell: React.FC<{
    token: Token;
    from: number;
    order: number;
    highlighted: boolean;
    highlightFrom: number;
    state?: keyof typeof stateColor;
}> = ({ token, from, order, highlighted, highlightFrom, state }) => {
    const frame = useCurrentFrame();
    const characters = tokenLength(token);
    const width = characters * PLATE.fontSize;
    const surfaceAppear = interpolate(frame, [from + order * 2, from + order * 2 + 8], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    const rubyAppear = interpolate(frame, [from + 18 + order * 2, from + 18 + order * 2 + 9], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    const tintAppear = interpolate(frame, [from + 30 + order * 2, from + 30 + order * 2 + 9], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    const highlight = highlighted
        ? interpolate(frame, [highlightFrom, highlightFrom + 8], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
        })
        : 0;
    const effectiveState = state ?? token.state;

    let offset = 0;
    const rubies = token.segments.map((segment, index) => {
        const length = [...segment.text].length;
        const left = offset * PLATE.fontSize;
        offset += length;
        if (!segment.reading) return null;
        return (
            <span
                key={index}
                style={{
                    position: 'absolute',
                    left,
                    top: 0,
                    width: length * PLATE.fontSize,
                    height: PLATE.rubyBand,
                    textAlign: 'center',
                    fontFamily: font.jp,
                    fontWeight: 700,
                    fontSize: PLATE.rubySize,
                    lineHeight: `${PLATE.rubyBand}px`,
                    color: palette.accentBright,
                    opacity: rubyAppear,
                    transform: `translateY(${(1 - rubyAppear) * -5}px)`,
                }}
            >
                {segment.reading}
            </span>
        );
    });

    return (
        <div style={{ position: 'relative', width, height: PLATE_LINE_HEIGHT, flexShrink: 0 }}>
            {highlight > 0 ? (
                <div
                    style={{
                        position: 'absolute',
                        left: -6,
                        top: PLATE.rubyBand - 5,
                        // Stops short of the status tint below: the highlight
                        // says "this is the word", the tint says "and you have
                        // not learned it yet", and covering one with the other
                        // loses half the story.
                        width: width + 12,
                        height: PLATE.textBand + 6,
                        background: `rgba(255,212,0,${0.22 + 0.06 * highlight})`,
                        border: `3px solid ${palette.yellow}`,
                        boxShadow: `0 0 26px rgba(255,212,0,${0.55 * highlight})`,
                        transform: `scale(${0.9 + highlight * 0.1})`,
                        opacity: highlight,
                    }}
                />
            ) : null}
            {rubies}
            <div
                style={{
                    position: 'absolute',
                    left: 0,
                    top: PLATE.rubyBand,
                    height: PLATE.textBand,
                    display: 'flex',
                    opacity: surfaceAppear,
                }}
            >
                {[...token.segments.map(segment => segment.text).join('')].map((character, index) => (
                    <span
                        key={index}
                        style={{
                            width: PLATE.fontSize,
                            textAlign: 'center',
                            fontFamily: font.jp,
                            fontWeight: 700,
                            fontSize: PLATE.fontSize,
                            lineHeight: `${PLATE.textBand}px`,
                            color: highlight > 0.4 ? palette.ink : palette.paper,
                        }}
                    >
                        {character}
                    </span>
                ))}
            </div>
            {effectiveState ? (
                <div
                    style={{
                        position: 'absolute',
                        left: 2,
                        top: PLATE.rubyBand + PLATE.textBand + PLATE.tintGap,
                        width: (width - 4) * tintAppear,
                        height: PLATE.tintHeight,
                        background: stateColor[effectiveState],
                        boxShadow: `0 0 10px ${stateColor[effectiveState]}88`,
                    }}
                />
            ) : null}
        </div>
    );
};

export const ReadoutPlate: React.FC<{
    origin: PlateOrigin;
    lines: readonly (readonly Token[])[];
    from: number;
    /** Frame at which the target token lights up under the pointer. */
    highlightFrom?: number;
    /** State overrides after mining, keyed "line:token". */
    upgraded?: Record<string, keyof typeof stateColor>;
    tabLabel: string;
}> = ({ origin, lines, from, highlightFrom, upgraded = {}, tabLabel }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const enter = spring({ frame: frame - from, fps, config: { damping: 18, mass: 0.8 } });
    if (enter <= 0.001) return null;

    let order = 0;
    return (
        <div
            style={{
                position: 'absolute',
                left: origin.left,
                top: origin.top,
                width: plateWidth(lines),
                transform: `rotate(${tilt.bubble}deg) scale(${0.96 + enter * 0.04})`,
                opacity: enter,
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    left: 26,
                    top: -34,
                    background: palette.paper,
                    color: palette.ink,
                    border: `4px solid ${palette.ink}`,
                    boxShadow: `6px 6px 0 ${palette.ink}`,
                    padding: '3px 16px 6px',
                    transform: `rotate(${tilt.nameTab}deg)`,
                    fontFamily: font.jp,
                    fontWeight: 900,
                    fontSize: 24,
                    whiteSpace: 'nowrap',
                }}
            >
                {tabLabel}
            </div>
            <div
                style={{
                    background: 'rgba(10,12,16,0.94)',
                    border: `5px solid ${palette.paper}`,
                    boxShadow: `14px 14px 0 ${palette.ink}`,
                    padding: `${PLATE.padY}px ${PLATE.padX}px`,
                }}
            >
                {lines.map((line, lineIndex) => (
                    <div
                        key={lineIndex}
                        style={{
                            display: 'flex',
                            marginBottom: lineIndex === lines.length - 1 ? 0 : PLATE.lineGap,
                        }}
                    >
                        {line.map((token, tokenIndex) => {
                            const cell = (
                                <TokenCell
                                    key={tokenIndex}
                                    token={token}
                                    from={from}
                                    order={order}
                                    highlighted={Boolean(token.target) && highlightFrom !== undefined}
                                    highlightFrom={highlightFrom ?? 0}
                                    state={upgraded[`${lineIndex}:${tokenIndex}`]}
                                />
                            );
                            order += 1;
                            return cell;
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};
