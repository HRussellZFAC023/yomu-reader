// Deterministic filename/path inference shared by the source-ledger and week-ledger
// builders. Every function is pure and derives only from the observed path — it never
// invents curricular content. Where a value cannot be evidenced it returns null and the
// caller records low confidence.

const GRAMMAR_POINT_RE = /〜[ぁ-んァ-ヶー一-龠A-Za-z0-9,、。・]+/g;

// Strip a filename to a comparable title stem for supersession/pairing:
// drop extension, a leading "New_"/"new " revision marker, and a trailing
// "_completed"/"(completed)" answer marker, collapse separators.
export function titleStem(name) {
    let s = name.replace(/\.[^.]+$/, '');
    s = s.replace(/^new[_\s-]+/i, '');
    s = s.replace(/[_\s-]*\(?\bcompleted\b\)?/i, '');
    s = s.replace(/[\s_]+/g, ' ').trim().toLowerCase();
    return s;
}

// Human-facing title from a filename: drop extension, tidy separators, keep original case.
export function sourceTitle(name) {
    return name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// "New_" (or "New ") prefix marks a revised handout in this corpus.
export function isRevision(name) {
    return /^new[_\s-]+/i.test(name);
}

// "_completed" / "(completed)" marks a filled-in / answer-key variant.
export function isCompleted(name) {
    return /\bcompleted\b/i.test(name);
}

// Chapter + optional sub-section, e.g. "Chapter 28", "Chapter 30-1", "Chapter30_2".
export function parseChapter(text) {
    const m = text.match(/chapter\s*0*(\d{1,3})(?:[-_ ]0*(\d{1,2}))?/i);
    if (!m) return null;
    return { chapter: Number(m[1]), subsection: m[2] ? Number(m[2]) : null };
}

// "Lesson 5-20260310" folder token -> { lesson, dateToken, dateISO }.
export function parseLessonFolder(segment) {
    const m = segment.match(/lesson\s*0*(\d{1,3})[-_ ](\d{8})/i);
    if (!m) return null;
    const t = m[2];
    const iso = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
    return { lesson: Number(m[1]), dateToken: t, dateISO: iso };
}

// genki-study-resources "lesson-0".."lesson-23".
export function parseGenkiLesson(segment) {
    const m = segment.match(/^lesson-(\d{1,2})$/i);
    return m ? Number(m[1]) : null;
}

// Extract 〜-prefixed grammar points appearing in a filename.
export function grammarPoints(text) {
    const out = [];
    const matches = text.match(GRAMMAR_POINT_RE);
    if (matches) for (const g of matches) if (!out.includes(g)) out.push(g);
    return out;
}

// Worksheet-family classification from filename keywords. Order matters: the most
// specific / most answer-bearing markers win. Returns a stable family slug.
export function worksheetFamily(name, kind) {
    const n = name.toLowerCase();
    if (kind === 'audio') return 'audio-track';
    if (kind === 'video') return 'video';
    if (kind === 'subtitle') return 'subtitle';
    if (kind === 'anki-deck') return 'anki-deck';
    if (kind === 'interactive') return 'interactive-lesson';
    if (kind === 'study-game-deck') return 'vocab-game-deck';
    if (kind === 'dictionary-db') return 'dictionary';
    if (kind === 'disc-image') return 'disc-image';
    if (kind === 'spreadsheet') return /vocab|word|語彙/.test(n) ? 'vocabulary-sheet' : 'spreadsheet';
    if (kind === 'deck') return 'slide';
    if (kind === 'ebook') return 'textbook';
    if (kind === 'data') return 'dictionary-or-data';
    if (kind === 'archive') return 'archive';
    if (/answer|kaitou|解答|模範/.test(n)) return 'answer-key';
    if (/info(?:rmation)?[\s_-]*gap/.test(n)) return 'info-gap';
    if (/word\s*card/.test(n)) return 'word-card';
    if (/vocab|vocabulary\s*sheet|語彙/.test(n)) return 'vocabulary-sheet';
    if (/transcript|script|スクリプト/.test(n)) return 'transcript';
    if (/listening|聴解|choukai/.test(n)) return 'listening-worksheet';
    if (/speaking|会話|kaiwa/.test(n)) return 'speaking-exercise';
    if (/\bhw\b|homework|宿題/.test(n)) {
        if (/reading|読解|作文/.test(n)) return 'reading-homework';
        return 'grammar-homework';
    }
    if (/reading|読解/.test(n)) return 'reading-worksheet';
    if (/grammar|文法|exercise|drill|practice|summary/.test(n)) return 'grammar-exercise';
    if (/workbook/.test(n)) return 'workbook';
    if (kind === 'pdf' || kind === 'document' || kind === 'document-web') return 'handout';
    if (kind === 'image') return 'image';
    return 'other';
}

// Level inference — ONLY from path-evidenced signals (a JLPT token or a Genki lesson
// number that actually appears in the path). A bare "Chapter N" token does NOT evidence a
// JLPT band, so no chapter-range heuristic is applied here; class-chapter level is instead
// filled from the chronology synthesis (basis: level-from-chronology-synthesis) with the
// grammar-analysis evidence behind it. Returns { level, basis } or null.
export function inferLevel(pathLower) {
    const jlpt = pathLower.match(/jlpt[\s_-]*n?([1-5])|\bn([1-5])\b/);
    if (jlpt) return { level: `JLPT N${jlpt[1] || jlpt[2]}`, basis: 'jlpt-token' };
    const genki = pathLower.match(/genki/);
    const lessonNo = pathLower.match(/lesson-(\d{1,2})/);
    if (genki && lessonNo) {
        const n = Number(lessonNo[1]);
        return { level: n <= 12 ? 'Genki I (beginner, ~N5)' : 'Genki II (upper-beginner, ~N4)', basis: 'genki-lesson-number' };
    }
    return null;
}

// Textbook / series inference from path tokens.
export function inferTextbook(pathLower) {
    if (/minna[\s_]*no[\s_]*nihongo|みんなの日本語/.test(pathLower)) return 'Minna no Nihongo';
    if (/genki/.test(pathLower)) return 'Genki';
    if (/tobira/.test(pathLower)) return 'Tobira';
    if (/quartet/.test(pathLower)) return 'Quartet';
    if (/tae\s*kim/.test(pathLower)) return 'Tae Kim';
    if (/kanji\s*look\s*and\s*learn/.test(pathLower)) return 'Kanji Look and Learn';
    return null;
}
