import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { SCENE_TWO } from '../content';
import { LAYOUT, SCENE_TWO_LINE, SCENE_TWO_SPOTLIGHT } from '../geometry';
import { font, palette, stateColor, tilt } from '../theme';
import { OcrBox, boxForLine } from '../components/annotation';
import { Cursor, ShortcutChip, Toast } from '../components/chrome';
import { CaptureFlash, Grain, OverlayDim, ScanSweep } from '../components/primitives';
import { ReadoutPlate, plateTargetIndex, plateTokenRect } from '../components/readout';

/**
 * The same loop, compressed: a different scene, a different speaker, the same
 * three keystrokes. The point of this act is that act one was not a set-piece.
 */
const BEAT = {
    chip: 0,
    press: 10,
    flash: 14,
    sweep: 16,
    sweepDuration: 22,
    dim: 16,
    box: 30,
    plate: 40,
    chipOut: 36,
    cursorIn: 46,
    cursorTravel: 26,
    hover: 74,
    card: 80,
    mine: 116,
    toast: 122,
} as const;

const LINES = [SCENE_TWO.line] as const;
const TARGET = plateTargetIndex(LINES);
const TARGET_RECT = plateTokenRect(LAYOUT.plateTwo, LINES, TARGET.line, TARGET.token);
const TARGET_CENTRE = [
    TARGET_RECT.left + TARGET_RECT.width / 2,
    TARGET_RECT.top + TARGET_RECT.height / 2,
] as const;

const MiniCard: React.FC<{ from: number; mineAt: number; left: number; top: number }> = ({
    from,
    mineAt,
    left,
    top,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const enter = spring({ frame: frame - from, fps, config: { damping: 16, mass: 0.7 } });
    const since = frame - mineAt;
    const pressed = since >= 0 && since < 7;
    const done = since >= 7;
    if (enter <= 0.001) return null;
    return (
        <div
            style={{
                position: 'absolute',
                left,
                top,
                width: 540,
                background: '#101216',
                border: `5px solid ${palette.ink}`,
                boxShadow: `12px 12px 0 ${palette.ink}`,
                transform: `rotate(${tilt.card}deg) translateX(${(1 - enter) * 70}px)`,
                opacity: enter,
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    background: palette.paper,
                    borderBottom: `5px solid ${palette.ink}`,
                    padding: '14px 22px 16px',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: 16,
                }}
            >
                <div
                    style={{
                        fontFamily: font.jp,
                        fontWeight: 900,
                        fontSize: 56,
                        lineHeight: 1,
                        color: palette.ink,
                    }}
                >
                    {SCENE_TWO.quickWord.spelling}
                </div>
                <div
                    style={{
                        padding: '4px 12px 6px',
                        border: `3px solid ${palette.ink}`,
                        background: done ? stateColor.learning : stateColor.new,
                        fontFamily: font.ui,
                        fontWeight: 900,
                        fontSize: 20,
                        color: palette.ink,
                    }}
                >
                    {done ? 'In deck' : 'New'}
                </div>
            </div>
            <div
                style={{
                    padding: '16px 22px 6px',
                    fontFamily: font.ui,
                    fontWeight: 600,
                    fontSize: 30,
                    color: 'rgba(255,255,255,0.93)',
                }}
            >
                {SCENE_TWO.quickWord.gloss}
            </div>
            <div style={{ padding: '10px 22px 22px' }}>
                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 18px 11px',
                        border: `4px solid ${palette.ink}`,
                        background: done ? palette.accentBright : palette.accent,
                        color: palette.ink,
                        boxShadow: pressed ? `2px 2px 0 ${palette.ink}` : `6px 6px 0 ${palette.ink}`,
                        transform: `translate(${pressed ? 4 : 0}px, ${pressed ? 4 : 0}px)`,
                        fontFamily: font.ui,
                        fontWeight: 900,
                        fontSize: 24,
                    }}
                >
                    <span>{done ? 'Added to deck' : 'Add to deck'}</span>
                    <span style={{ fontSize: 16, border: `2px solid ${palette.ink}`, padding: '1px 7px 2px' }}>M</span>
                </div>
            </div>
        </div>
    );
};

export const ActTwo: React.FC = () => {
    const frame = useCurrentFrame();
    const push = interpolate(frame, [0, 150], [1.018, 1.052], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    const dim = interpolate(frame, [BEAT.dim, BEAT.dim + 16], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    const upgraded = frame >= BEAT.mine + 8
        ? { [`${TARGET.line}:${TARGET.token}`]: 'known' as const }
        : undefined;

    return (
        <AbsoluteFill style={{ background: palette.ink, overflow: 'hidden' }}>
            <AbsoluteFill style={{ transform: `scale(${push})` }}>
                <Img
                    src={staticFile('frames/scene-2.jpg')}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <OcrBox rect={boxForLine(SCENE_TWO_LINE, SCENE_TWO.line)} from={BEAT.box} />
            </AbsoluteFill>

            <OverlayDim strength={dim} spotlight={SCENE_TWO_SPOTLIGHT} />

            <ReadoutPlate
                origin={LAYOUT.plateTwo}
                lines={LINES}
                from={BEAT.plate}
                highlightFrom={frame >= BEAT.hover ? BEAT.hover : undefined}
                upgraded={upgraded}
                tabLabel="画面から読み取り"
            />

            <MiniCard from={BEAT.card} mineAt={BEAT.mine} left={1240} top={300} />

            <ShortcutChip
                from={BEAT.chip}
                pressAt={BEAT.press}
                exitAt={BEAT.chipOut}
                label="Read the screen"
                left={556}
                top={108}
                scale={0.88}
            />

            <Toast at={BEAT.toast} text="Added to deck." left={1274} top={604} />

            <Cursor
                path={[
                    [1680, 500],
                    [1200, 600],
                    TARGET_CENTRE,
                ]}
                from={BEAT.cursorIn}
                duration={BEAT.cursorTravel}
                clickAt={BEAT.hover}
                hideAt={BEAT.mine}
            />

            <div
                style={{
                    position: 'absolute',
                    left: 96,
                    top: 372,
                    transform: `rotate(${tilt.dayBand}deg)`,
                    opacity: interpolate(frame, [20, 34, 122, 136], [0, 1, 1, 0], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                    }),
                    background: palette.paper,
                    border: `5px solid ${palette.ink}`,
                    boxShadow: `10px 10px 0 ${palette.red}`,
                    padding: '8px 22px 13px',
                    fontFamily: font.display,
                    fontWeight: 900,
                    fontSize: 44,
                    color: palette.ink,
                    whiteSpace: 'nowrap',
                }}
            >
                Any game. Any scene.
            </div>

            <ScanSweep from={BEAT.sweep} duration={BEAT.sweepDuration} />
            <CaptureFlash at={BEAT.flash} />
            <Grain />
        </AbsoluteFill>
    );
};
