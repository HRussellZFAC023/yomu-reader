import React from 'react';
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { CARD } from '../content';
import { SCENE_ONE_THUMB } from '../geometry';
import { font, palette } from '../theme';

/**
 * What the deck actually received. Mining is only worth showing if you show the
 * note, and the note is the argument: the word, the sentence it came from, the
 * audio, and a screenshot of the exact frame — none of which you get by pausing
 * the game and typing the word into a dictionary.
 */
export const SavedNote: React.FC<{
    from: number;
    left: number;
    top: number;
    width?: number;
    tilt: number;
}> = ({ from, left, top, width = 620, tilt }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const enter = spring({ frame: frame - from, fps, config: { damping: 18, mass: 0.9 } });
    if (enter <= 0.001) return null;

    const thumbWidth = 292;
    const thumbScale = thumbWidth / SCENE_ONE_THUMB.width;
    const thumbHeight = SCENE_ONE_THUMB.height * thumbScale;

    const rows: { label: string; value: React.ReactNode; jp?: boolean }[] = [
        {
            label: 'Word',
            value: `${CARD.spelling}【${CARD.reading}】`,
            jp: true,
        },
        {
            label: 'Sentence',
            value: `${CARD.contextBefore}${CARD.spelling}${CARD.contextAfter}`,
            jp: true,
        },
        { label: 'Meaning', value: CARD.senses[0]?.glosses.join('; ') ?? '' },
    ];

    return (
        <div
            style={{
                position: 'absolute',
                left,
                top,
                width,
                background: palette.paper,
                border: `5px solid ${palette.ink}`,
                boxShadow: `14px 14px 0 ${palette.ink}`,
                transform: `rotate(${tilt}deg) translateX(${(1 - enter) * 70}px)`,
                opacity: enter,
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    background: palette.ink,
                    color: palette.paper,
                    padding: '11px 22px 13px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontFamily: font.ui,
                    fontWeight: 900,
                    fontSize: 22,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                }}
            >
                <span>Saved to {CARD.deckName}</span>
                <span style={{ color: palette.accentBright }}>1 new card</span>
            </div>

            <div style={{ padding: '18px 22px 8px' }}>
                {rows.map((row, index) => {
                    const start = from + 10 + index * 8;
                    const appear = interpolate(frame, [start, start + 11], [0, 1], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                    });
                    return (
                        <div
                            key={row.label}
                            style={{
                                display: 'flex',
                                gap: 16,
                                alignItems: 'baseline',
                                marginBottom: 12,
                                opacity: appear,
                                transform: `translateY(${(1 - appear) * 7}px)`,
                            }}
                        >
                            <span
                                style={{
                                    minWidth: 128,
                                    fontFamily: font.ui,
                                    fontWeight: 800,
                                    fontSize: 19,
                                    letterSpacing: '0.1em',
                                    textTransform: 'uppercase',
                                    color: 'rgba(11,11,12,0.5)',
                                }}
                            >
                                {row.label}
                            </span>
                            <span
                                style={{
                                    fontFamily: row.jp ? font.jp : font.ui,
                                    fontWeight: row.jp ? 700 : 600,
                                    fontSize: row.jp ? 30 : 26,
                                    color: palette.ink,
                                    lineHeight: 1.2,
                                }}
                            >
                                {row.value}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div style={{ display: 'flex', gap: 20, padding: '4px 22px 24px', alignItems: 'flex-start' }}>
                <div
                    style={{
                        opacity: interpolate(frame, [from + 34, from + 46], [0, 1], {
                            extrapolateLeft: 'clamp',
                            extrapolateRight: 'clamp',
                        }),
                    }}
                >
                    <div
                        style={{
                            fontFamily: font.ui,
                            fontWeight: 800,
                            fontSize: 19,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: 'rgba(11,11,12,0.5)',
                            marginBottom: 7,
                        }}
                    >
                        Screenshot
                    </div>
                    <div
                        style={{
                            width: thumbWidth,
                            height: thumbHeight,
                            border: `4px solid ${palette.ink}`,
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                    >
                        <Img
                            src={staticFile('frames/scene-1.jpg')}
                            style={{
                                position: 'absolute',
                                width: 1920 * thumbScale,
                                height: 1080 * thumbScale,
                                left: -SCENE_ONE_THUMB.left * thumbScale,
                                top: -SCENE_ONE_THUMB.top * thumbScale,
                                maxWidth: 'none',
                            }}
                        />
                    </div>
                </div>
                <div
                    style={{
                        opacity: interpolate(frame, [from + 42, from + 54], [0, 1], {
                            extrapolateLeft: 'clamp',
                            extrapolateRight: 'clamp',
                        }),
                    }}
                >
                    <div
                        style={{
                            fontFamily: font.ui,
                            fontWeight: 800,
                            fontSize: 19,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: 'rgba(11,11,12,0.5)',
                            marginBottom: 7,
                        }}
                    >
                        Audio
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            height: thumbHeight + 8,
                            padding: '0 14px',
                            border: `4px solid ${palette.ink}`,
                        }}
                    >
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(bar => (
                            <div
                                key={bar}
                                style={{
                                    width: 6,
                                    height: 14 + Math.abs(Math.sin(bar * 1.17)) * 52,
                                    background: palette.accent,
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
