import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { loadVideoFonts } from './fonts';
import { acts, palette } from './theme';
import { ActOne } from './scenes/ActOne';
import { ActTwo } from './scenes/ActTwo';
import { EndCard } from './components/title';

/**
 * A slash wipe across the act two / act three cut. Everything else in the clip
 * is a hard cut; the one transition is spent on the moment the video stops
 * demonstrating and starts telling you where to get it.
 */
const SlashWipe: React.FC<{ duration: number }> = ({ duration }) => {
    const frame = useCurrentFrame();
    const progress = interpolate(frame, [0, duration], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    const bands = [
        { color: palette.red, offset: 0, skew: -14 },
        { color: palette.ink, offset: 0.16, skew: -14 },
    ];
    return (
        <AbsoluteFill style={{ overflow: 'hidden', pointerEvents: 'none' }}>
            {bands.map(band => {
                const local = Math.max(0, Math.min(1, (progress - band.offset) / (1 - band.offset)));
                const x = interpolate(local, [0, 0.5, 1], [-2600, 0, 2600]);
                return (
                    <div
                        key={band.color}
                        style={{
                            position: 'absolute',
                            left: x,
                            top: -240,
                            width: 2600,
                            height: 1560,
                            background: band.color,
                            transform: `skewX(${band.skew}deg)`,
                        }}
                    />
                );
            })}
        </AbsoluteFill>
    );
};

export const GamingLoop: React.FC = () => {
    loadVideoFonts();
    const wipeDuration = 22;
    return (
        <AbsoluteFill style={{ background: palette.ink }}>
            <Sequence from={acts.one.from} durationInFrames={acts.one.durationInFrames}>
                <ActOne />
            </Sequence>
            <Sequence from={acts.two.from} durationInFrames={acts.two.durationInFrames}>
                <ActTwo />
            </Sequence>
            <Sequence from={acts.three.from} durationInFrames={acts.three.durationInFrames}>
                <EndCard />
            </Sequence>
            <Sequence from={acts.three.from - Math.round(wipeDuration / 2)} durationInFrames={wipeDuration}>
                <SlashWipe duration={wipeDuration} />
            </Sequence>
        </AbsoluteFill>
    );
};
