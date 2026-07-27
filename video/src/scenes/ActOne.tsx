import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { SCENE_ONE } from '../content';
import { LAYOUT, SCENE_ONE_LINES, SCENE_ONE_SPOTLIGHT } from '../geometry';
import { palette, tilt } from '../theme';
import { Leader, OcrBox, boxForLine } from '../components/annotation';
import { WordCard } from '../components/card';
import { ControlLegend, Cursor, DeckStack, FlyingCard, ShortcutChip, Toast } from '../components/chrome';
import { CaptureFlash, Grain, OverlayDim, ScanSweep } from '../components/primitives';
import { ReadoutPlate, plateHeight, plateTargetIndex, plateTokenRect, plateWidth } from '../components/readout';
import { SavedNote } from '../components/saved-note';
import { TitleSlam } from '../components/title';

/**
 * Every beat of act one, act-relative. One object rather than magic numbers
 * scattered through the JSX, because the act is a chain of "this happens a beat
 * after that" and a retimed capture has to drag the parse along with it.
 */
const BEAT = {
    title: 20,
    titleOut: 74,
    chip: 88,
    press: 116,
    flash: 120,
    sweep: 122,
    sweepDuration: 30,
    dim: 124,
    box: [140, 148],
    plate: 160,
    legend: 196,
    cursorIn: 214,
    cursorTravel: 42,
    chipOut: 214,
    hover: 256,
    leader: 264,
    card: 270,
    audio: 342,
    cursorToButton: 398,
    buttonTravel: 38,
    mine: 442,
    toast: 448,
    fly: 452,
    flyDuration: 28,
    // The counter ticks as the card lands, not while it is still in the air.
    deckBump: 478,
    tintUpgrade: 486,
    cardOut: 498,
    cursorHide: 500,
    note: 510,
} as const;

const LINES = SCENE_ONE.lines;
const TARGET = plateTargetIndex(LINES);
const TARGET_RECT = plateTokenRect(LAYOUT.plate, LINES, TARGET.line, TARGET.token);
const TARGET_CENTRE = [
    TARGET_RECT.left + TARGET_RECT.width / 2,
    TARGET_RECT.top + TARGET_RECT.height / 2,
] as const;
const PLATE_RIGHT = LAYOUT.plate.left + plateWidth(LINES);
const PLATE_BOTTOM = LAYOUT.plate.top + plateHeight(LINES);
const CARD_ANCHOR = [LAYOUT.card.left + 18, LAYOUT.card.top + 150] as const;
const MINE_BUTTON = [LAYOUT.card.left + 128, LAYOUT.card.top + 512] as const;
const DECK_CENTRE = [LAYOUT.deck.left + 150, LAYOUT.deck.top + 54] as const;

export const ActOne: React.FC = () => {
    const frame = useCurrentFrame();

    const push = interpolate(frame, [0, 640], [1.055, 1.012], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    const dim = interpolate(frame, [BEAT.dim, BEAT.dim + 22], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    const cardExit = interpolate(frame, [BEAT.cardOut, BEAT.cardOut + 14], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    const mined = frame >= BEAT.mine;
    // 素材 arrived new; once it is in the deck the line repaints it as learning.
    const upgraded = frame >= BEAT.tintUpgrade
        ? { [`${TARGET.line}:${TARGET.token}`]: 'learning' as const }
        : undefined;

    const [lineOne, lineTwo] = LINES;
    const [metricsOne, metricsTwo] = SCENE_ONE_LINES;
    if (!lineOne || !lineTwo || !metricsOne || !metricsTwo) return null;

    return (
        <AbsoluteFill style={{ background: palette.ink, overflow: 'hidden' }}>
            {/*
              Frame space. The backdrop drifts, and anything anchored to pixels
              inside the game frame — the OCR region boxes — has to drift with
              it or it will point at the wrong words.
            */}
            <AbsoluteFill style={{ transform: `scale(${push})` }}>
                <Img
                    src={staticFile('frames/scene-1.jpg')}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <OcrBox rect={boxForLine(metricsOne, lineOne)} from={BEAT.box[0]} />
                <OcrBox rect={boxForLine(metricsTwo, lineTwo)} from={BEAT.box[1]} />
            </AbsoluteFill>

            <OverlayDim strength={dim} spotlight={SCENE_ONE_SPOTLIGHT} />

            <TitleSlam from={BEAT.title} exitAt={BEAT.titleOut} left={962} top={112} />

            <ReadoutPlate
                origin={LAYOUT.plate}
                lines={LINES}
                from={BEAT.plate}
                highlightFrom={frame >= BEAT.hover ? BEAT.hover : undefined}
                upgraded={upgraded}
                tabLabel="画面から読み取り"
            />

            {frame >= BEAT.leader && frame < BEAT.cardOut ? (
                <Leader
                    from={BEAT.leader}
                    a={[PLATE_RIGHT - 30, TARGET_CENTRE[1]]}
                    b={CARD_ANCHOR}
                />
            ) : null}

            <ControlLegend from={BEAT.legend} left={LAYOUT.legend.left} top={LAYOUT.legend.top} />
            <DeckStack
                from={BEAT.legend}
                left={LAYOUT.deck.left}
                top={LAYOUT.deck.top}
                incrementAt={BEAT.deckBump}
            />

            <ShortcutChip
                from={BEAT.chip}
                pressAt={BEAT.press}
                exitAt={BEAT.chipOut}
                label="Read the screen"
                left={LAYOUT.shortcut.left}
                top={LAYOUT.shortcut.top}
            />

            {cardExit < 1 ? (
                <div
                    style={{
                        position: 'absolute',
                        left: LAYOUT.card.left,
                        top: LAYOUT.card.top,
                        transform: `translateX(${cardExit * 210}px)`,
                        opacity: 1 - cardExit,
                    }}
                >
                    <WordCard
                        from={BEAT.card}
                        audioAt={BEAT.audio}
                        mineAt={BEAT.mine}
                        mined={mined}
                        width={LAYOUT.cardWidth}
                        tilt={tilt.card}
                    />
                </div>
            ) : null}

            {frame >= BEAT.note ? (
                <SavedNote from={BEAT.note} left={LAYOUT.card.left + 10} top={LAYOUT.card.top + 130} tilt={tilt.card} />
            ) : null}

            <FlyingCard
                at={BEAT.fly}
                duration={BEAT.flyDuration}
                fromPoint={MINE_BUTTON}
                toPoint={DECK_CENTRE}
            />
            <Toast at={BEAT.toast} text="Added to deck." left={LAYOUT.card.left + 44} top={PLATE_BOTTOM - 92} />

            <Cursor
                path={[
                    [1660, 470],
                    [1180, 620],
                    TARGET_CENTRE,
                ]}
                from={BEAT.cursorIn}
                duration={BEAT.cursorTravel}
                clickAt={BEAT.hover}
                hideAt={BEAT.cursorToButton}
            />
            <Cursor
                path={[
                    TARGET_CENTRE,
                    [1060, 700],
                    MINE_BUTTON,
                ]}
                from={BEAT.cursorToButton}
                duration={BEAT.buttonTravel}
                clickAt={BEAT.mine}
                hideAt={BEAT.cursorHide}
            />

            <ScanSweep from={BEAT.sweep} duration={BEAT.sweepDuration} />
            <CaptureFlash at={BEAT.flash} />
            <Grain />
        </AbsoluteFill>
    );
};
