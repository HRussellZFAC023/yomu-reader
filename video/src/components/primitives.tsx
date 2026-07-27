import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { font, palette } from '../theme';

/**
 * A white plate with a hard black keyline and an offset black shadow — the one
 * panel treatment the whole clip uses. Nothing is axis-aligned, so `tilt` is
 * required rather than optional: a caller has to decide how far off-square the
 * panel sits.
 */
export const KeylinePanel: React.FC<{
    tilt: number;
    style?: React.CSSProperties;
    keyline?: number;
    offset?: number;
    background?: string;
    children?: React.ReactNode;
}> = ({ tilt, style, keyline = 5, offset = 10, background = palette.paper, children }) => (
    <div
        style={{
            position: 'absolute',
            background,
            border: `${keyline}px solid ${palette.ink}`,
            boxShadow: `${offset}px ${offset}px 0 ${palette.ink}`,
            transform: `rotate(${tilt}deg)`,
            ...style,
        }}
    >
        {children}
    </div>
);

/** The small rotated label tab the game hangs above its speech bubbles. */
export const AngledTag: React.FC<{
    tilt: number;
    style?: React.CSSProperties;
    background?: string;
    color?: string;
    children: React.ReactNode;
}> = ({ tilt, style, background = palette.paper, color = palette.ink, children }) => (
    <div
        style={{
            position: 'absolute',
            background,
            color,
            border: `4px solid ${palette.ink}`,
            boxShadow: `7px 7px 0 ${palette.ink}`,
            transform: `rotate(${tilt}deg)`,
            padding: '6px 18px 8px',
            fontFamily: font.jp,
            fontWeight: 900,
            fontSize: 30,
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
            ...style,
        }}
    >
        {children}
    </div>
);

/**
 * Grain plus a vignette. The reference frames are heavily graded and a clean
 * vector overlay laid straight onto them reads as a mock-up; a little noise
 * puts the two layers in the same air.
 */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.09 }) => {
    const frame = useCurrentFrame();
    // Re-seeding every third frame keeps the texture alive without strobing.
    const seed = Math.floor(frame / 3) % 7;
    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            <svg width="100%" height="100%" style={{ opacity, mixBlendMode: 'overlay' }}>
                <filter id={`grain-${seed}`}>
                    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={3} seed={seed} />
                    <feColorMatrix type="saturate" values="0" />
                </filter>
                <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
            </svg>
            <AbsoluteFill
                style={{
                    background: 'radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.55) 100%)',
                }}
            />
        </AbsoluteFill>
    );
};

/**
 * Dims and slightly desaturates the captured frame while the overlay is up,
 * except for a bright rectangle around the text being read. The real overlay
 * darkens the screen behind itself; the spotlight is what makes a 1080p game
 * frame legible on a phone.
 */
export const OverlayDim: React.FC<{
    strength: number;
    spotlight: { left: number; top: number; width: number; height: number } | null;
}> = ({ strength, spotlight }) => {
    if (strength <= 0.001) return null;
    const hole = spotlight
        ? `radial-gradient(ellipse ${spotlight.width * 0.62}px ${spotlight.height * 1.05}px at ${spotlight.left + spotlight.width / 2}px ${spotlight.top + spotlight.height / 2}px, rgba(0,0,0,0) 46%, rgba(0,0,0,1) 100%)`
        : undefined;
    return (
        <AbsoluteFill
            style={{
                background: `rgba(6,6,9,${0.62 * strength})`,
                WebkitMaskImage: hole,
                maskImage: hole,
                pointerEvents: 'none',
            }}
        />
    );
};

/** One-frame-ish white flash for the moment of capture. */
export const CaptureFlash: React.FC<{ at: number }> = ({ at }) => {
    const frame = useCurrentFrame();
    const opacity = interpolate(frame, [at - 1, at, at + 3, at + 11], [0, 0.92, 0.34, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    if (opacity <= 0.001) return null;
    return <AbsoluteFill style={{ background: '#ffffff', opacity, pointerEvents: 'none' }} />;
};

/**
 * The capture sweep. A band of the accent colour runs down the frame once,
 * leaving a hairline behind it — the visual shorthand for "the screen was just
 * read", and the beat the whole clip hangs on.
 */
export const ScanSweep: React.FC<{ from: number; duration: number }> = ({ from, duration }) => {
    const frame = useCurrentFrame();
    const progress = interpolate(frame, [from, from + duration], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    if (frame < from || frame > from + duration) return null;
    const y = progress * 1080;
    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            <div
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: y - 190,
                    height: 190,
                    background: `linear-gradient(to bottom, rgba(94,167,128,0) 0%, rgba(94,167,128,0.18) 62%, rgba(141,220,176,0.42) 100%)`,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: y,
                    height: 3,
                    background: palette.accentBright,
                    boxShadow: `0 0 26px 6px rgba(141,220,176,0.75)`,
                }}
            />
        </AbsoluteFill>
    );
};
