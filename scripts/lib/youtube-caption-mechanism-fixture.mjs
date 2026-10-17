// MECHANISM FIXTURE — hand-made caption timings for the youtube-watch
// recording, used only when YouTube refuses the recording machine's own
// /api/timedtext requests (429 "automated queries"; docs/dev/recorded-pages.md,
// Follow-ups). The page, its stylesheets and its player response are still
// recorded from the live watch page; only the two json3 tracks come from here.
//
// The tracks follow the observable shape of YouTube's auto-generated (ASR)
// json3, the shape the product parses and the player draws:
//   - one window event first (wpWinPosId/wsWinStyleId), then line events in
//     window 1 whose words roll in at tOffsetMs with acAsrConf;
//   - a two-row roll-up: each line stays up until the line after next starts,
//     and an aAppend "\n" event ends each line's speech;
//   - pauses in speech where every line has gone;
//   - the tlang=en translation as whole-line events, one per Japanese line.
// Every word is replaced by the recorder's redaction anyway, so the words here
// are filler; what a gate reads is the timing. Deterministic: no clock, no
// randomness, so a re-record writes the same tracks.

const WORDS = ['今日', 'は', '学校', 'で', '日本語', 'を', '勉強', 'し', 'ます', '先生', 'が', '新しい', '言葉', 'について', '話し', 'ました', '明日', 'も', '練習', 'します'];
const ENGLISH = ['today', 'we', 'study', 'Japanese', 'at', 'school', 'and', 'the', 'teacher', 'talks', 'about', 'new', 'words', 'again', 'tomorrow'];
const WORD_MS = [420, 260, 510, 300, 640, 280, 470, 350];
const LINE_WORDS = [4, 3, 5, 2, 4, 6, 3, 5];
// After every PAUSE_EVERY lines the speaker stops for PAUSE_MS, so the window clears.
const PAUSE_EVERY = 5;
const PAUSE_MS = 2600;
const LINE_GAP_MS = 120;

function lineTimings(totalMs) {
    const lines = [];
    let at = 160;
    let word = 0;
    for (let index = 0; at < totalMs; index += 1) {
        const count = LINE_WORDS[index % LINE_WORDS.length];
        const segs = [];
        let offset = 0;
        for (let n = 0; n < count; n += 1, word += 1) {
            segs.push({ utf8: WORDS[word % WORDS.length], ...(n ? { tOffsetMs: offset } : {}), acAsrConf: 0 });
            offset += WORD_MS[word % WORD_MS.length];
        }
        lines.push({ start: at, speechMs: offset, segs, pauseAfter: (index + 1) % PAUSE_EVERY === 0 });
        at += offset + (lines.at(-1).pauseAfter ? PAUSE_MS : LINE_GAP_MS);
    }
    return lines;
}

// A line stays up until the line after next starts, unless a pause clears the window first.
function lineEnd(lines, index) {
    const line = lines[index];
    if (line.pauseAfter || !lines[index + 1]) return line.start + line.speechMs + 400;
    const next = lines[index + 1];
    if (next.pauseAfter || !lines[index + 2]) return next.start + next.speechMs + 400;
    return lines[index + 2].start;
}

function japaneseTrack(lines, totalMs) {
    const events = [{ tStartMs: 0, dDurationMs: totalMs, id: 1, wpWinPosId: 1, wsWinStyleId: 1 }];
    lines.forEach((line, index) => {
        const end = lineEnd(lines, index);
        events.push({ tStartMs: line.start, dDurationMs: end - line.start, wWinId: 1, segs: line.segs });
        const spoken = line.start + line.speechMs;
        if (end > spoken) events.push({ tStartMs: spoken, dDurationMs: end - spoken, wWinId: 1, aAppend: 1, segs: [{ utf8: '\n' }] });
    });
    return {
        wireMagic: 'pb3',
        pens: [{}],
        wsWinStyles: [{}, { mhModeHint: 2, juJustifCode: 0, sdScrollDir: 3 }],
        wpWinPositions: [{}, { apPoint: 6, ahHorPos: 20, avVerPos: 100, rcRows: 2, ccCols: 40 }],
        events,
    };
}

function englishTrack(lines) {
    const events = lines.map((line, index) => {
        const next = lines[index + 1];
        const end = line.pauseAfter || !next ? line.start + line.speechMs + 400 : next.start;
        const words = line.segs.map((_, n) => ENGLISH[(index * 3 + n) % ENGLISH.length]);
        return { tStartMs: line.start, dDurationMs: end - line.start, segs: [{ utf8: words.join(' ') }] };
    });
    return { wireMagic: 'pb3', pens: [{}], wsWinStyles: [{}], wpWinPositions: [{}], events };
}

/** { ja, jaEn } json3 tracks covering `seconds` of video. */
export function asrCaptionTracksMechanismFixture({ seconds }) {
    const totalMs = seconds * 1000;
    const lines = lineTimings(totalMs);
    return { ja: japaneseTrack(lines, totalMs), jaEn: englishTrack(lines), mechanismFixture: true };
}
