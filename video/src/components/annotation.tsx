import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import type { Token } from '../content';
import { lineBox, lineCharacterCount, type LineMetrics, type Rect } from '../geometry';
import { palette } from '../theme';

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * The region box the OCR engine hands back for one line of text: a hairline
 * rectangle that draws itself on, with heavier corner ticks. Deliberately not a
 * solid fill — this is the proof that the words on the plate came off the
 * screen, so the source text has to stay visible underneath.
 */
export const OcrBox: React.FC<{ rect: Rect; from: number; duration?: number; color?: string }> = ({
    rect,
    from,
    duration = 14,
    color = palette.accentBright,
}) => {
    const frame = useCurrentFrame();
    const raw = interpolate(frame, [from, from + duration], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    if (raw <= 0) return null;
    const progress = easeOut(raw);
    const tick = 22;
    const corners: React.CSSProperties[] = [
        { left: 0, top: 0, borderLeft: `3px solid ${color}`, borderTop: `3px solid ${color}` },
        { right: 0, top: 0, borderRight: `3px solid ${color}`, borderTop: `3px solid ${color}` },
        { left: 0, bottom: 0, borderLeft: `3px solid ${color}`, borderBottom: `3px solid ${color}` },
        { right: 0, bottom: 0, borderRight: `3px solid ${color}`, borderBottom: `3px solid ${color}` },
    ];
    return (
        <div
            style={{
                position: 'absolute',
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                border: `1px solid ${color}55`,
                opacity: progress,
                transform: `scale(${0.965 + progress * 0.035})`,
                transformOrigin: 'left center',
            }}
        >
            {corners.map((corner, index) => (
                <div key={index} style={{ position: 'absolute', width: tick, height: tick, ...corner }} />
            ))}
        </div>
    );
};

/**
 * Hairline leader between two points, drawn on over time. Used to tie the
 * hovered word to the card that opened because of it.
 */
export const Leader: React.FC<{
    from: number;
    a: readonly [number, number];
    b: readonly [number, number];
    color?: string;
}> = ({ from, a, b, color = palette.yellow }) => {
    const frame = useCurrentFrame();
    const raw = interpolate(frame, [from, from + 12], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    if (raw <= 0) return null;
    const progress = easeOut(raw);
    const elbow: [number, number] = [b[0] - 70, a[1]];
    const points: [number, number][] = [[a[0], a[1]], elbow, [b[0], b[1]]];
    const segments = points.length - 1;
    const drawn: [number, number][] = [points[0] as [number, number]];
    for (let index = 1; index < points.length; index++) {
        const previous = points[index - 1] as [number, number];
        const point = points[index] as [number, number];
        const local = Math.max(0, Math.min(1, progress * segments - (index - 1)));
        drawn.push([
            previous[0] + (point[0] - previous[0]) * local,
            previous[1] + (point[1] - previous[1]) * local,
        ]);
    }
    return (
        <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
            <polyline
                points={drawn.map(point => point.join(',')).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeDasharray="9 7"
            />
            <circle cx={a[0]} cy={a[1]} r={4} fill={color} />
        </svg>
    );
};

/** Line-level helper so scenes do not re-derive the same box twice. */
export function boxForLine(metrics: LineMetrics, tokens: readonly Token[]): Rect {
    return lineBox(metrics, lineCharacterCount(tokens));
}
