import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CARD } from '../content';
import { font, palette, pitchColor, stateColor, type PitchClass } from '../theme';

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * The reader's pitch-accent graph, at the reader's own geometry: 24px per mora,
 * high at y=10, low at y=29, r=3 dots, mora labels at y=44 (see
 * renderPitchGraphSvg in src/reader/popup/pitch.ts). Scaled up for video, but
 * the proportions are the product's, so nobody watching this learns a shape
 * they will not see again in the app.
 */
export const PitchGraph: React.FC<{
    morae: readonly string[];
    levels: readonly ('H' | 'L')[];
    pattern: PitchClass;
    scale?: number;
    from: number;
    labelColor?: string;
}> = ({ morae, levels, pattern, scale = 1.9, from, labelColor = palette.ink }) => {
    const frame = useCurrentFrame();
    const width = morae.length * 24 + 18;
    const startX = 21;
    const colour = pitchColor[pattern];
    const points = levels.map((level, index) => [startX + index * 24, level === 'H' ? 10 : 29] as const);
    const polyline = points.map(point => point.join(',')).join(' ');
    const length = points.reduce((total, point, index) => {
        const previous = points[index - 1];
        if (!previous) return total;
        return total + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    }, 0);
    const draw = easeOut(interpolate(frame, [from, from + 16], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    }));

    return (
        <svg
            width={width * scale}
            height={46 * scale}
            viewBox={`0 0 ${width} 46`}
            style={{ display: 'block', overflow: 'visible' }}
        >
            <polyline
                points={polyline}
                fill="none"
                stroke={colour}
                strokeWidth={2}
                strokeDasharray={length}
                strokeDashoffset={length * (1 - draw)}
            />
            {points.map((point, index) => {
                const appear = interpolate(frame, [from + index * 5, from + index * 5 + 7], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                });
                return (
                    <circle key={index} cx={point[0]} cy={point[1]} r={3 * appear} fill={colour} />
                );
            })}
            {morae.map((mora, index) => (
                <text
                    key={index}
                    x={startX + index * 24}
                    y={44}
                    textAnchor="middle"
                    fontSize={14}
                    fontFamily={font.jp}
                    fontWeight={700}
                    fill={labelColor}
                    opacity={interpolate(frame, [from + index * 5, from + index * 5 + 7], [0, 1], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                    })}
                >
                    {mora}
                </text>
            ))}
        </svg>
    );
};

const Chip: React.FC<{
    label: string;
    from: number;
    index: number;
    tone?: 'plain' | 'accent' | 'state';
    color?: string;
}> = ({ label, from, index, tone = 'plain', color }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const pop = spring({ frame: frame - from - index * 4, fps, config: { damping: 14, mass: 0.5 } });
    const background = tone === 'accent' ? palette.accent : tone === 'state' ? (color ?? palette.paper) : 'transparent';
    const ink = tone === 'plain' ? 'rgba(255,255,255,0.78)' : palette.ink;
    return (
        <span
            style={{
                display: 'inline-block',
                padding: '5px 14px 7px',
                border: `2px solid ${tone === 'plain' ? 'rgba(255,255,255,0.34)' : palette.ink}`,
                background,
                color: ink,
                fontFamily: font.ui,
                fontWeight: 800,
                fontSize: 21,
                letterSpacing: '0.02em',
                transform: `scale(${pop})`,
                whiteSpace: 'nowrap',
            }}
        >
            {label}
        </span>
    );
};

const AudioButton: React.FC<{ from: number; playAt: number }> = ({ from, playAt }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const appear = spring({ frame: frame - from, fps, config: { damping: 13, mass: 0.6 } });
    const since = frame - playAt;
    const playing = since >= 0 && since < 46;
    const ring = playing ? 1 + Math.sin(since / 3.4) * 0.06 : 1;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, transform: `scale(${appear})` }}>
            <div
                style={{
                    width: 62,
                    height: 62,
                    borderRadius: '50%',
                    border: `4px solid ${palette.ink}`,
                    background: playing ? palette.accent : palette.paper,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: `scale(${ring})`,
                    boxShadow: playing ? `0 0 0 8px rgba(94,167,128,0.28)` : 'none',
                }}
            >
                <svg width={28} height={28} viewBox="0 0 24 24" fill={palette.ink}>
                    <path d="M4 9v6h4l5 5V4L8 9H4z" />
                    <path
                        d="M16.5 8.5a5 5 0 0 1 0 7"
                        fill="none"
                        stroke={palette.ink}
                        strokeWidth={2}
                        strokeLinecap="round"
                        opacity={playing ? 1 : 0.45}
                    />
                </svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 40 }}>
                {[0, 1, 2, 3, 4, 5, 6].map(bar => {
                    const height = playing
                        ? 8 + Math.abs(Math.sin(since / 3.1 + bar * 0.9)) * 30
                        : 6;
                    return (
                        <div
                            key={bar}
                            style={{
                                width: 5,
                                height,
                                background: playing ? palette.accent : 'rgba(11,11,12,0.24)',
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
};

const ActionButton: React.FC<{
    label: string;
    hint?: string;
    primary?: boolean;
    pressedAt?: number;
    from: number;
    index: number;
    done?: boolean;
    doneLabel?: string;
}> = ({ label, hint, primary = false, pressedAt, from, index, done = false, doneLabel }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const appear = spring({ frame: frame - from - index * 5, fps, config: { damping: 15, mass: 0.6 } });
    const since = pressedAt === undefined ? -1 : frame - pressedAt;
    const pressed = since >= 0 && since < 7;
    const settled = done && since >= 7;
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 20px 13px',
                border: `4px solid ${palette.ink}`,
                background: settled ? palette.accentBright : primary ? palette.accent : 'rgba(255,255,255,0.07)',
                color: primary || settled ? palette.ink : 'rgba(255,255,255,0.9)',
                boxShadow: pressed ? `2px 2px 0 ${palette.ink}` : `6px 6px 0 ${palette.ink}`,
                transform: `translate(${pressed ? 4 : 0}px, ${pressed ? 4 : 0}px) scale(${appear})`,
                fontFamily: font.ui,
                fontWeight: 900,
                fontSize: 25,
                whiteSpace: 'nowrap',
            }}
        >
            <span>{settled && doneLabel ? doneLabel : label}</span>
            {hint ? (
                <span
                    style={{
                        fontSize: 17,
                        fontWeight: 900,
                        padding: '2px 8px 3px',
                        border: `2px solid ${primary || settled ? palette.ink : 'rgba(255,255,255,0.45)'}`,
                        opacity: 0.85,
                    }}
                >
                    {hint}
                </span>
            ) : null}
        </div>
    );
};

/**
 * The lookup card. Dark body because that is what the overlay actually looks
 * like, white header band because that is what makes it sit on a game frame the
 * way the game's own dialogue plates do.
 */
export const WordCard: React.FC<{
    from: number;
    audioAt: number;
    mineAt?: number;
    mined?: boolean;
    width?: number;
    tilt: number;
}> = ({ from, audioAt, mineAt, mined = false, width = 660, tilt }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const enter = spring({ frame: frame - from, fps, config: { damping: 17, mass: 0.9 } });
    const stateChip = mined && mineAt !== undefined && frame - mineAt >= 8;

    return (
        <div
            style={{
                position: 'absolute',
                width,
                border: `5px solid ${palette.ink}`,
                boxShadow: `14px 14px 0 ${palette.ink}`,
                background: '#101216',
                transform: `rotate(${tilt}deg) translateX(${(1 - enter) * 90}px) scale(${0.94 + enter * 0.06})`,
                opacity: enter,
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    background: palette.paper,
                    borderBottom: `5px solid ${palette.ink}`,
                    padding: '18px 26px 16px',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: 18,
                }}
            >
                <div>
                    <div
                        style={{
                            fontFamily: font.jp,
                            fontWeight: 700,
                            fontSize: 26,
                            color: 'rgba(11,11,12,0.62)',
                            letterSpacing: '0.16em',
                            marginBottom: 2,
                            opacity: interpolate(frame, [from + 6, from + 16], [0, 1], {
                                extrapolateLeft: 'clamp',
                                extrapolateRight: 'clamp',
                            }),
                        }}
                    >
                        {CARD.reading}
                    </div>
                    <div
                        style={{
                            fontFamily: font.jp,
                            fontWeight: 900,
                            fontSize: 84,
                            lineHeight: 0.94,
                            color: palette.ink,
                            letterSpacing: '0.01em',
                        }}
                    >
                        {CARD.spelling}
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span
                            style={{
                                fontFamily: font.jp,
                                fontWeight: 900,
                                fontSize: 22,
                                color: pitchColor[CARD.pitchClass],
                                border: `2px solid ${pitchColor[CARD.pitchClass]}`,
                                padding: '2px 9px 3px',
                            }}
                        >
                            {CARD.pitchLabel} [{CARD.pitchPattern}]
                        </span>
                        <PitchGraph
                            morae={CARD.morae}
                            levels={CARD.pitchLevels}
                            pattern={CARD.pitchClass}
                            from={from + 10}
                            scale={1.55}
                        />
                    </div>
                    <AudioButton from={from + 14} playAt={audioAt} />
                </div>
            </div>

            <div style={{ padding: '20px 26px 8px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Chip label={CARD.posChip} from={from + 16} index={0} />
                <Chip label={CARD.commonChip} from={from + 16} index={1} />
                <Chip label={CARD.frequencyChip} from={from + 16} index={2} />
                <Chip
                    label={stateChip ? 'In deck' : 'New'}
                    from={from + 16}
                    index={3}
                    tone="state"
                    color={stateChip ? stateColor.learning : stateColor.new}
                />
            </div>

            <div style={{ padding: '6px 26px 4px' }}>
                {CARD.senses.map((sense, index) => {
                    const start = from + 24 + index * 9;
                    const appear = interpolate(frame, [start, start + 11], [0, 1], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                    });
                    return (
                        <div
                            key={index}
                            style={{
                                display: 'flex',
                                gap: 12,
                                marginBottom: 8,
                                opacity: appear,
                                transform: `translateY(${(1 - appear) * 8}px)`,
                            }}
                        >
                            <span
                                style={{
                                    fontFamily: font.ui,
                                    fontWeight: 900,
                                    fontSize: 22,
                                    color: palette.accentBright,
                                    minWidth: 24,
                                }}
                            >
                                {index + 1}
                            </span>
                            <span
                                style={{
                                    fontFamily: font.ui,
                                    fontWeight: 600,
                                    fontSize: 27,
                                    color: 'rgba(255,255,255,0.93)',
                                    lineHeight: 1.24,
                                }}
                            >
                                {sense.glosses.join('; ')}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div
                style={{
                    margin: '10px 26px 0',
                    padding: '13px 16px 15px',
                    borderLeft: `5px solid ${palette.accent}`,
                    background: 'rgba(255,255,255,0.05)',
                    fontFamily: font.jp,
                    fontSize: 29,
                    color: 'rgba(255,255,255,0.86)',
                    opacity: interpolate(frame, [from + 52, from + 64], [0, 1], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                    }),
                }}
            >
                {CARD.contextBefore}
                <span
                    style={{
                        background: palette.yellow,
                        color: palette.ink,
                        fontWeight: 900,
                        padding: '0 4px',
                    }}
                >
                    {CARD.spelling}
                </span>
                {CARD.contextAfter}
            </div>

            <div style={{ display: 'flex', gap: 14, padding: '20px 26px 26px', alignItems: 'center' }}>
                <ActionButton
                    label="Add to deck"
                    hint="M"
                    primary
                    from={from + 30}
                    index={0}
                    pressedAt={mineAt}
                    done={mined}
                    doneLabel="Added to deck"
                />
                <ActionButton label="Known" hint="K" from={from + 30} index={1} />
                <ActionButton label="Anki" from={from + 30} index={2} />
            </div>
        </div>
    );
};
