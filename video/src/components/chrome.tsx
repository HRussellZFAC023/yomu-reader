import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CARD, LEGEND } from '../content';
import { font, palette, tilt } from '../theme';

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * ⌘ and ⇧ are drawn rather than typed. The vendored Japanese subset does not
 * carry them and system fallbacks vary by machine, so a rendered glyph would be
 * the one thing in the clip that could come out as tofu on someone else's
 * render — and it happens to be the single most important symbol on screen.
 */
const CommandGlyph: React.FC<{ size: number; color: string }> = ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.1}>
        <rect x="9" y="9" width="6" height="6" />
        <path d="M9 9H6.5A2.5 2.5 0 1 1 9 6.5V9zM15 9h2.5A2.5 2.5 0 1 0 15 6.5V9zM9 15H6.5A2.5 2.5 0 1 0 9 17.5V15zM15 15h2.5A2.5 2.5 0 1 1 15 17.5V15z" />
    </svg>
);

const ShiftGlyph: React.FC<{ size: number; color: string }> = ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.1} strokeLinejoin="round">
        <path d="M12 3 4 11h4v8h8v-8h4z" />
    </svg>
);

const KeyCap: React.FC<{
    children: React.ReactNode;
    pressed: boolean;
    size: number;
}> = ({ children, pressed, size }) => (
    <div
        style={{
            minWidth: size,
            height: size,
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: pressed ? palette.accentBright : palette.paper,
            border: `4px solid ${palette.ink}`,
            boxShadow: pressed ? `2px 2px 0 ${palette.ink}` : `6px 7px 0 ${palette.ink}`,
            transform: `translate(${pressed ? 4 : 0}px, ${pressed ? 5 : 0}px)`,
            fontFamily: font.ui,
            fontWeight: 900,
            fontSize: size * 0.52,
            color: palette.ink,
        }}
    >
        {children}
    </div>
);

/**
 * The shortcut, on screen, being pressed. This is the whole promise of the
 * product in one gesture, so it gets its own object rather than a caption.
 */
export const ShortcutChip: React.FC<{
    from: number;
    pressAt: number;
    label: string;
    left: number;
    top: number;
    scale?: number;
    exitAt?: number;
}> = ({ from, pressAt, label, left, top, scale = 1, exitAt }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const enter = spring({ frame: frame - from, fps, config: { damping: 15, mass: 0.7 } });
    const since = frame - pressAt;
    const pressed = since >= 0 && since < 8;
    const exit = exitAt === undefined
        ? 1
        : interpolate(frame, [exitAt, exitAt + 12], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    if (enter <= 0.001 || exit <= 0.001) return null;
    const size = 74;
    return (
        <div
            style={{
                position: 'absolute',
                left,
                top,
                transform: `rotate(${tilt.chip}deg) scale(${scale * (0.86 + enter * 0.14)}) translateY(${(1 - enter) * 26}px)`,
                transformOrigin: 'left bottom',
                opacity: Math.min(enter, exit),
                display: 'flex',
                alignItems: 'center',
                gap: 14,
            }}
        >
            <KeyCap pressed={pressed} size={size}>
                <CommandGlyph size={size * 0.5} color={palette.ink} />
            </KeyCap>
            <KeyCap pressed={pressed} size={size}>
                <ShiftGlyph size={size * 0.5} color={palette.ink} />
            </KeyCap>
            <KeyCap pressed={pressed} size={size}>
                Y
            </KeyCap>
            <div
                style={{
                    marginLeft: 8,
                    padding: '9px 18px 11px',
                    background: palette.ink,
                    color: palette.paper,
                    border: `3px solid ${palette.ink}`,
                    fontFamily: font.ui,
                    fontWeight: 900,
                    fontSize: 27,
                    letterSpacing: '0.02em',
                    whiteSpace: 'nowrap',
                }}
            >
                {label}
            </div>
        </div>
    );
};

/**
 * The overlay's control legend: small, quiet, bottom corner — the same register
 * as the game's own 早送り / オート / ログ legend, so it reads as part of the
 * screen rather than as an ad pasted onto it.
 */
export const ControlLegend: React.FC<{ from: number; left: number; top: number }> = ({ from, left, top }) => {
    const frame = useCurrentFrame();
    return (
        <div
            style={{
                position: 'absolute',
                left,
                top,
                transform: `rotate(${tilt.legend}deg)`,
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
                // The legend sits over an oversized character portrait, so it
                // needs its own ground to stay readable without getting loud.
                background: 'rgba(6,7,9,0.55)',
                padding: '12px 16px 14px',
            }}
        >
            {LEGEND.map((row, index) => {
                const start = from + index * 6;
                const appear = interpolate(frame, [start, start + 12], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                });
                if (appear <= 0) return null;
                return (
                    <div
                        key={row.key}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 11,
                            opacity: appear * 0.92,
                            transform: `translateX(${(1 - easeOut(appear)) * -14}px)`,
                        }}
                    >
                        <span
                            style={{
                                minWidth: 74,
                                textAlign: 'center',
                                padding: '3px 9px 4px',
                                border: `2px solid rgba(255,255,255,0.7)`,
                                color: 'rgba(255,255,255,0.92)',
                                fontFamily: font.ui,
                                fontWeight: 800,
                                fontSize: 19,
                                background: 'rgba(8,8,10,0.55)',
                            }}
                        >
                            {row.key}
                        </span>
                        <span
                            style={{
                                fontFamily: font.jp,
                                fontWeight: 700,
                                fontSize: 22,
                                color: 'rgba(255,255,255,0.9)',
                                textShadow: '0 2px 6px rgba(0,0,0,0.9)',
                            }}
                        >
                            {row.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

/** Where a mined card lands. The counter ticking is the proof the card was kept. */
export const DeckStack: React.FC<{
    from: number;
    left: number;
    top: number;
    incrementAt?: number;
}> = ({ from, left, top, incrementAt }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const enter = spring({ frame: frame - from, fps, config: { damping: 16, mass: 0.7 } });
    const since = incrementAt === undefined ? -1 : frame - incrementAt;
    const bumped = since >= 0;
    const kick = bumped ? spring({ frame: since, fps, config: { damping: 9, mass: 0.4 } }) : 0;
    const count = CARD.deckCountBefore + (bumped ? 1 : 0);
    if (enter <= 0.001) return null;
    return (
        <div
            style={{
                position: 'absolute',
                left,
                top,
                transform: `rotate(${tilt.deck}deg) scale(${0.9 + enter * 0.1})`,
                opacity: enter,
            }}
        >
            {[2, 1].map(depth => (
                <div
                    key={depth}
                    style={{
                        position: 'absolute',
                        left: depth * 8,
                        top: depth * 8,
                        width: 300,
                        height: 108,
                        border: `4px solid ${palette.ink}`,
                        background: 'rgba(20,23,28,0.9)',
                    }}
                />
            ))}
            <div
                style={{
                    position: 'relative',
                    width: 300,
                    height: 108,
                    border: `5px solid ${palette.ink}`,
                    background: palette.paper,
                    boxShadow: `9px 9px 0 ${palette.ink}`,
                    padding: '12px 18px',
                    transform: `translateY(${-kick * 7}px)`,
                }}
            >
                <div
                    style={{
                        fontFamily: font.ui,
                        fontWeight: 800,
                        fontSize: 20,
                        letterSpacing: '0.14em',
                        color: 'rgba(11,11,12,0.6)',
                        textTransform: 'uppercase',
                    }}
                >
                    {CARD.deckName} deck
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span
                        style={{
                            fontFamily: font.display,
                            fontWeight: 900,
                            fontSize: 52,
                            lineHeight: 1,
                            color: palette.ink,
                        }}
                    >
                        {count}
                    </span>
                    <span
                        style={{
                            fontFamily: font.ui,
                            fontWeight: 900,
                            fontSize: 24,
                            color: palette.accent,
                            opacity: bumped ? interpolate(since, [0, 6, 40, 52], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0,
                        }}
                    >
                        +1
                    </span>
                </div>
            </div>
        </div>
    );
};

/**
 * The pointer. Hard black keyline and a paper fill so it survives on top of a
 * saturated game frame, unlike a real OS cursor in a screen recording.
 */
export const Cursor: React.FC<{
    path: readonly (readonly [number, number])[];
    from: number;
    duration: number;
    clickAt?: number;
    hideAt?: number;
}> = ({ path, from, duration, clickAt, hideAt }) => {
    const frame = useCurrentFrame();
    if (frame < from) return null;
    if (hideAt !== undefined && frame >= hideAt) return null;
    const t = easeOut(interpolate(frame, [from, from + duration], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    }));
    const segments = path.length - 1;
    const scaled = Math.min(t * segments, segments - 0.0001);
    const index = Math.floor(scaled);
    const local = scaled - index;
    const a = path[index];
    const b = path[index + 1];
    if (!a || !b) return null;
    const x = a[0] + (b[0] - a[0]) * local;
    const y = a[1] + (b[1] - a[1]) * local;
    const since = clickAt === undefined ? -1 : frame - clickAt;
    const clicking = since >= 0 && since < 8;
    return (
        <div style={{ position: 'absolute', left: x, top: y, transform: `scale(${clicking ? 0.86 : 1})` }}>
            {clicking ? (
                <div
                    style={{
                        position: 'absolute',
                        left: -32,
                        top: -32,
                        width: 64,
                        height: 64,
                        borderRadius: '50%',
                        border: `3px solid ${palette.yellow}`,
                        opacity: interpolate(since, [0, 8], [0.9, 0], { extrapolateRight: 'clamp' }),
                        transform: `scale(${interpolate(since, [0, 8], [0.3, 1.5], { extrapolateRight: 'clamp' })})`,
                    }}
                />
            ) : null}
            <svg width={40} height={46} viewBox="0 0 20 23" style={{ display: 'block' }}>
                <path
                    d="M2 1.5 17 12.5h-6.6l3.4 7.4-2.9 1.4-3.4-7.5-4.5 4.1z"
                    fill={palette.paper}
                    stroke={palette.ink}
                    strokeWidth={1.9}
                    strokeLinejoin="round"
                />
            </svg>
        </div>
    );
};

/** The reader's own toast copy, positively framed the way the product writes it. */
export const Toast: React.FC<{ at: number; text: string; left: number; top: number }> = ({
    at,
    text,
    left,
    top,
}) => {
    const frame = useCurrentFrame();
    const since = frame - at;
    if (since < 0 || since > 74) return null;
    const appear = interpolate(since, [0, 8, 60, 74], [0, 1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    return (
        <div
            style={{
                position: 'absolute',
                left,
                top,
                transform: `rotate(${tilt.nameTab}deg) translateY(${(1 - appear) * 16}px)`,
                opacity: appear,
                padding: '11px 24px 13px',
                background: palette.accentBright,
                border: `4px solid ${palette.ink}`,
                boxShadow: `8px 8px 0 ${palette.ink}`,
                fontFamily: font.ui,
                fontWeight: 900,
                fontSize: 30,
                color: palette.ink,
                whiteSpace: 'nowrap',
            }}
        >
            {text}
        </div>
    );
};

/**
 * The mined card flying from the popup into the deck. Short, and it lands — the
 * point of the beat is that the card is kept, not that it moves.
 */
export const FlyingCard: React.FC<{
    at: number;
    duration: number;
    fromPoint: readonly [number, number];
    toPoint: readonly [number, number];
}> = ({ at, duration, fromPoint, toPoint }) => {
    const frame = useCurrentFrame();
    const since = frame - at;
    if (since < 0 || since > duration) return null;
    const t = easeOut(since / duration);
    const x = fromPoint[0] + (toPoint[0] - fromPoint[0]) * t;
    // A shallow arc reads as "flung", where a straight line reads as "moved".
    const y = fromPoint[1] + (toPoint[1] - fromPoint[1]) * t - Math.sin(t * Math.PI) * 120;
    const scale = 1 - t * 0.72;
    return (
        <div
            style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 240,
                height: 150,
                marginLeft: -120,
                marginTop: -75,
                background: palette.paper,
                border: `5px solid ${palette.ink}`,
                boxShadow: `10px 10px 0 ${palette.ink}`,
                transform: `rotate(${-14 + t * 30}deg) scale(${scale})`,
                opacity: interpolate(since, [duration - 8, duration], [1, 0], { extrapolateLeft: 'clamp' }),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: font.jp,
                fontWeight: 900,
                fontSize: 74,
                color: palette.ink,
            }}
        >
            {CARD.spelling}
        </div>
    );
};
