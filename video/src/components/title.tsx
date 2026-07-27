import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { END_CARD, SHORTCUT_WINDOWS } from '../content';
import { font, palette, tilt } from '../theme';
import { Grain } from './primitives';

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** The cold-open title: a hard plate that slams in, holds, and leaves. */
export const TitleSlam: React.FC<{
    from: number;
    exitAt: number;
    left: number;
    top: number;
}> = ({ from, exitAt, left, top }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const enter = spring({ frame: frame - from, fps, config: { damping: 12, mass: 0.5, stiffness: 190 } });
    const exit = interpolate(frame, [exitAt, exitAt + 14], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    if (enter <= 0.001 || exit >= 1) return null;
    return (
        <div
            style={{
                position: 'absolute',
                left,
                top,
                transform: `rotate(${tilt.yomuTag}deg) translateX(${(1 - enter) * 130 + exit * 180}px) scale(${0.94 + enter * 0.06})`,
                opacity: Math.min(enter, 1 - exit),
            }}
        >
            <div
                style={{
                    display: 'inline-block',
                    background: palette.paper,
                    border: `6px solid ${palette.ink}`,
                    boxShadow: `14px 14px 0 ${palette.red}`,
                    padding: '10px 30px 16px',
                }}
            >
                <div
                    style={{
                        fontFamily: font.display,
                        fontWeight: 900,
                        fontSize: 96,
                        lineHeight: 0.98,
                        letterSpacing: '-0.02em',
                        color: palette.ink,
                    }}
                >
                    YOMU <span style={{ color: palette.red }}>GAMING</span>
                </div>
            </div>
            <div
                style={{
                    marginTop: 12,
                    marginLeft: 6,
                    display: 'inline-block',
                    background: palette.ink,
                    color: palette.paper,
                    border: `4px solid ${palette.ink}`,
                    padding: '7px 18px 10px',
                    fontFamily: font.jp,
                    fontWeight: 700,
                    fontSize: 30,
                    transform: `rotate(${tilt.dayBand - tilt.yomuTag}deg)`,
                }}
            >
                {END_CARD.kicker}
            </div>
        </div>
    );
};

/**
 * The brand mark at portrait scale, bleeding off the corner the way the game
 * hangs an oversized character portrait off the frame edge: the 「よ」 from the
 * app icon, with the icon's own pitch-accent contour riding over its shoulder.
 */
export const YomuMark: React.FC<{ from: number }> = ({ from }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const enter = spring({ frame: frame - from, fps, config: { damping: 20, mass: 1.4 } });

    // The app icon's pitch contour (public/yomu-icon.svg) normalised to its own
    // origin and blown up, so it can be placed over the glyph's shoulder in
    // pixels instead of being scaled out of a 64-unit icon box.
    const scale = 26;
    const pad = 16;
    const contour = ([
        [0, 0],
        [5.1, 0],
        [8.5, 4.6],
        [14.3, 4.6],
    ] as const).map(([x, y]) => [pad + x * scale, pad + y * scale] as const);
    const contourWidth = pad * 2 + 14.3 * scale;
    const contourHeight = pad * 2 + 4.6 * scale;

    return (
        <div
            style={{
                position: 'absolute',
                left: -230,
                bottom: 0,
                width: 700,
                height: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `translateY(${(1 - enter) * 210}px) rotate(${-5 + (1 - enter) * 5}deg)`,
                opacity: enter,
            }}
        >
            <span
                style={{
                    fontFamily: font.jp,
                    fontWeight: 900,
                    fontSize: 620,
                    lineHeight: 1,
                    color: palette.paper,
                    WebkitTextStroke: `16px ${palette.ink}`,
                    paintOrder: 'stroke fill',
                    textShadow: `24px 20px 0 ${palette.red}`,
                }}
            >
                よ
            </span>
            <svg
                width={contourWidth}
                height={contourHeight}
                viewBox={`0 0 ${contourWidth} ${contourHeight}`}
                style={{ position: 'absolute', left: 590, top: 120, overflow: 'visible' }}
            >
                <polyline
                    points={contour.map(point => point.join(',')).join(' ')}
                    fill="none"
                    stroke={palette.ink}
                    strokeWidth={17}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <polyline
                    points={contour.map(point => point.join(',')).join(' ')}
                    fill="none"
                    stroke={palette.pitchAtamadaka}
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                {contour.map(([x, y], index) => (
                    <circle
                        key={index}
                        cx={x}
                        cy={y}
                        r={9}
                        fill={palette.pitchAtamadaka}
                        stroke={palette.ink}
                        strokeWidth={4}
                    />
                ))}
            </svg>
        </div>
    );
};

const Claim: React.FC<{ text: string; index: number; from: number }> = ({ text, index, from }) => {
    const frame = useCurrentFrame();
    const start = from + index * 7;
    const appear = easeOut(interpolate(frame, [start, start + 14], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    }));
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                marginBottom: 16,
                opacity: appear,
                transform: `translateX(${(1 - appear) * 26}px)`,
            }}
        >
            <div style={{ width: 16, height: 16, background: palette.accentBright, marginTop: 10, flexShrink: 0 }} />
            <div
                style={{
                    fontFamily: font.ui,
                    fontWeight: 600,
                    fontSize: 31,
                    lineHeight: 1.26,
                    color: 'rgba(255,255,255,0.92)',
                }}
            >
                {text}
            </div>
        </div>
    );
};

/** Where to get it. */
export const EndCard: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const wordmark = spring({ frame: frame - 4, fps, config: { damping: 13, mass: 0.6, stiffness: 180 } });
    const url = spring({ frame: frame - 52, fps, config: { damping: 11, mass: 0.5 } });
    const kicker = spring({ frame: frame - 0, fps, config: { damping: 14, mass: 0.5 } });

    return (
        <AbsoluteFill style={{ background: '#08090b', overflow: 'hidden' }}>
            <div
                style={{
                    position: 'absolute',
                    left: -200,
                    top: 690,
                    width: 2400,
                    height: 320,
                    background: palette.red,
                    transform: 'rotate(-4.2deg)',
                    opacity: 0.9,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    left: -200,
                    top: 660,
                    width: 2400,
                    height: 14,
                    background: palette.ink,
                    transform: 'rotate(-4.2deg)',
                }}
            />

            <YomuMark from={0} />

            <div style={{ position: 'absolute', left: 742, top: 96, width: 1110 }}>
                <div
                    style={{
                        display: 'inline-block',
                        background: palette.ink,
                        color: palette.accentBright,
                        border: `4px solid ${palette.accentBright}`,
                        padding: '7px 20px 10px',
                        fontFamily: font.jp,
                        fontWeight: 700,
                        fontSize: 30,
                        transform: `rotate(${tilt.dayBand}deg) scale(${kicker})`,
                        transformOrigin: 'left center',
                    }}
                >
                    {END_CARD.kicker}
                </div>

                <div
                    style={{
                        marginTop: 26,
                        transform: `rotate(${tilt.yomuTag}deg) translateX(${(1 - wordmark) * 110}px)`,
                        opacity: wordmark,
                    }}
                >
                    <span
                        style={{
                            fontFamily: font.display,
                            fontWeight: 900,
                            fontSize: 158,
                            lineHeight: 0.9,
                            letterSpacing: '-0.03em',
                            color: palette.paper,
                        }}
                    >
                        {END_CARD.wordmark}
                    </span>
                    <span
                        style={{
                            display: 'inline-block',
                            marginLeft: 18,
                            transform: 'translateY(-22px)',
                            background: palette.accentBright,
                            color: palette.ink,
                            border: `6px solid ${palette.ink}`,
                            boxShadow: `10px 10px 0 ${palette.ink}`,
                            padding: '4px 22px 12px',
                            fontFamily: font.display,
                            fontWeight: 900,
                            fontSize: 96,
                            lineHeight: 1,
                            letterSpacing: '-0.02em',
                        }}
                    >
                        {END_CARD.productLine}
                    </span>
                </div>

                <div style={{ marginTop: 52 }}>
                    {END_CARD.claims.map((claim, index) => (
                        <Claim key={claim} text={claim} index={index} from={22} />
                    ))}
                </div>

                <div
                    style={{
                        marginTop: 40,
                        display: 'inline-block',
                        background: palette.paper,
                        border: `7px solid ${palette.ink}`,
                        boxShadow: `14px 14px 0 ${palette.ink}`,
                        padding: '10px 32px 18px',
                        transform: `rotate(${tilt.chip}deg) scale(${0.9 + url * 0.1})`,
                        opacity: url,
                    }}
                >
                    <span
                        style={{
                            fontFamily: font.display,
                            fontWeight: 900,
                            fontSize: 82,
                            lineHeight: 1,
                            letterSpacing: '-0.02em',
                            color: palette.ink,
                        }}
                    >
                        {END_CARD.url}
                    </span>
                </div>

                <div
                    style={{
                        marginTop: 26,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 22,
                        opacity: interpolate(frame, [70, 86], [0, 1], {
                            extrapolateLeft: 'clamp',
                            extrapolateRight: 'clamp',
                        }),
                    }}
                >
                    <span
                        style={{
                            fontFamily: font.ui,
                            fontWeight: 800,
                            fontSize: 26,
                            letterSpacing: '0.09em',
                            color: 'rgba(255,255,255,0.82)',
                        }}
                    >
                        {END_CARD.platforms}
                    </span>
                    <span style={{ width: 8, height: 8, background: palette.accentBright }} />
                    <span
                        style={{
                            fontFamily: font.ui,
                            fontWeight: 800,
                            fontSize: 26,
                            letterSpacing: '0.09em',
                            color: 'rgba(255,255,255,0.82)',
                        }}
                    >
                        {END_CARD.footnote}
                    </span>
                </div>
            </div>

            <div
                style={{
                    position: 'absolute',
                    left: 742,
                    top: 962,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    opacity: interpolate(frame, [84, 100], [0, 1], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                    }),
                    transform: `rotate(${tilt.legend}deg)`,
                }}
            >
                <span
                    style={{
                        fontFamily: font.ui,
                        fontWeight: 900,
                        fontSize: 24,
                        color: palette.ink,
                        background: palette.paper,
                        border: `3px solid ${palette.ink}`,
                        padding: '4px 14px 6px',
                    }}
                >
                    {SHORTCUT_WINDOWS}
                </span>
                <span
                    style={{
                        fontFamily: font.ui,
                        fontWeight: 700,
                        fontSize: 24,
                        color: 'rgba(255,255,255,0.7)',
                    }}
                >
                    on Windows and Linux
                </span>
            </div>

            <Grain opacity={0.06} />
        </AbsoluteFill>
    );
};
