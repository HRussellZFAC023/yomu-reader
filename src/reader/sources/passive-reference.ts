import { escapeHtml, renderRuby } from '../dom';
import type { JPDBCard, JPDBToken } from '../app/types';

// Shared passive dictionary-reference markup. Every definition provider that
// embeds a tappable word inside a popover (headwords, example targets, related
// words) renders through here so the word participates in the reader's own
// annotation machinery: `.jpdb-reader-parseable` opts it into the nested
// re-parse (furigana/pitch from our parser) and `.jpdb-reader-passive-word`
// gives it hover/tap lookup without active styling.
export interface PassiveReferenceView {
    text: string;
    reading: string;
    dictionary: string;
    sentence?: string;
    className?: string;
    // Per-kanji annotated reading in bracket form (e.g. "読[よ]み取[と]る");
    // when present the ruby is distributed per kanji instead of one rt over
    // the whole word.
    annotatedReading?: string;
    // Provider-specific identity attributes (e.g. data-vid/data-sid).
    identityAttributes?: Record<string, string>;
}

export function renderPassiveReference(view: PassiveReferenceView): string {
    const reading = visibleReferenceReading(view.text, view.reading);
    const identity = Object.entries(view.identityAttributes ?? {})
        .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
        .join(' ');
    const readingAttribute = reading ? ` data-reading="${escapeHtml(reading)}"` : '';
    const identityAttributes = identity ? ` ${identity}` : '';
    const extraClass = view.className?.trim();
    const classes = `jpdb-reader-word jpdb-reader-passive-word jpdb-reader-parseable${reading ? ' jpdb-reader-has-furi' : ''}${extraClass ? ` ${escapeHtml(extraClass)}` : ''}`;
    // Prefer per-kanji ruby from the annotated reading so okurigana stays as
    // plain base text instead of the whole reading sitting over the whole word.
    const content = reading && view.annotatedReading && /\[[^\]]+\]/.test(view.annotatedReading)
        ? renderAnnotatedReadingRuby(view.annotatedReading)
        : renderPassiveReferenceContent(view.text, reading);
    return `<span class="${classes}" data-jpdb-reader-passive="true"${identityAttributes} data-dictionary="${escapeHtml(view.dictionary)}" data-pitch-class="" data-sentence="${escapeHtml(view.sentence ?? view.text)}" data-expression="${escapeHtml(view.text)}"${readingAttribute} tabindex="-1">${content}</span>`;
}

// Renders the bracket-annotated form "漢字[かんじ]" as per-kanji ruby.
export function renderAnnotatedReadingRuby(value: string): string {
    const source = value.trim();
    if (!source) return '';
    let html = '';
    let offset = 0;
    const regex = /([一-龯々-〇]+)\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
        html += escapeHtml(source.slice(offset, match.index));
        html += `<ruby><span class="jpdb-reader-ruby-base">${escapeHtml(match[1] ?? '')}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(match[2] ?? '')}</rt><rp>)</rp></ruby>`;
        offset = match.index + match[0].length;
    }
    html += escapeHtml(source.slice(offset));
    return html;
}

function renderPassiveReferenceContent(text: string, reading: string): string {
    return reading
        ? renderRuby(text, referenceRubyToken(text, reading))
        : escapeHtml(text);
}

function referenceRubyToken(text: string, reading: string): JPDBToken {
    return {
        card: {
            vid: 0,
            sid: 0,
            rid: 0,
            spelling: text,
            reading,
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
        } as JPDBCard,
        start: 0,
        end: text.length,
        length: text.length,
        rubies: [],
        pitchClass: '',
        sentence: text,
    };
}

function visibleReferenceReading(text: string, reading: string): string {
    const normalizedText = text.trim();
    const normalizedReading = reading.trim();
    return normalizedReading && normalizedReading !== normalizedText ? normalizedReading : '';
}
