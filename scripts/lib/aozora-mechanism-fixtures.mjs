// Mechanism Fixtures built, in memory, from the recorded Aozora Bunko
// 『吾輩は猫である』 (aozora-wagahai, public domain): the recording's own text,
// author ruby included, in a page shape no committed recording has. A gate
// serves one in place of the recording's document:
//
//   await run.page.route(run.recording.manifest.url, route => route.fulfill(fixture));
//
// Nothing here is written to disk; docs/dev/recorded-pages.md lists them.
import { loadRecording } from './recorded-page.mjs';

export const AOZORA_SLUG = 'aozora-wagahai';
const MAIN_TEXT = '<div class="main_text">';
const AFTER_MAIN_TEXT = '<div class="bibliographical_information">';
const PARAGRAPH_LINE = /^(?!<div|<\/div|<br>)(.+)<br>$/u;

/** The recorded page's stylesheet, which a reader app does not load. */
export const AOZORA_CSS_URL = new URL('../../aozora.css', loadRecording(AOZORA_SLUG).manifest.url).href;

/**
 * aozora-paragraphs-mechanism-fixture: the recording as served, each
 * <br>-ended line of .main_text a <p> (margin 0), .main_text in an <article>.
 * The shape Narou and Kakuyomu serve: <p> lines holding author ruby.
 */
export function aozoraParagraphsMechanismFixture() {
    const html = loadRecording(AOZORA_SLUG).documentHtml();
    const { start, end } = mainTextBounds(html);
    const body = html.slice(start, end).split('\n').map(line => {
        const text = line.match(PARAGRAPH_LINE)?.[1];
        return text ? `<p>${text}</p>` : line;
    }).join('\n');
    return fulfilled(`${html.slice(0, start)}<article>${body}</article>${html.slice(end)}`.replace('</head>', '<style>.main_text p{margin:0}</style></head>'));
}

/**
 * clamp-cards-mechanism-fixture: the recording's paragraphs as synopsis
 * cards in a grid (a novel-ranking page): every third card's text is a
 * 3-line -webkit-line-clamp, then a fixed-height card, then a plain one.
 * Card 0 opens with kana (どこで生れたか…) and holds author ruby (見当).
 */
export function clampCardsMechanismFixture() {
    const cards = aozoraParagraphHtml().slice(1, 10).map((text, index) => `<section class="card" id="c${index}"><h3>第${index + 1}話</h3><p class="${['clamp', 'fixed', 'plain'][index % 3]}">${text.replace(/^　/u, '')}</p></section>`);
    return fulfilled(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>吾輩は猫である</title><style>
body{margin:0;font-family:serif}
.grid{display:grid;grid-template-columns:repeat(3,300px);gap:12px;margin:12px}
.card{border:1px solid #ccc;padding:8px;font-size:15px;line-height:1.6}
.clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.fixed{height:120px;overflow:hidden}
.card p{margin:0}
</style></head><body><main><div class="grid">${cards.join('')}</div></main></body></html>`);
}

function aozoraParagraphHtml() {
    const html = loadRecording(AOZORA_SLUG).documentHtml();
    const { start, end } = mainTextBounds(html);
    return html.slice(start, end).split('\n').flatMap(line => line.match(PARAGRAPH_LINE)?.[1] ?? []);
}

function mainTextBounds(html) {
    const start = html.indexOf(MAIN_TEXT);
    const end = html.indexOf(AFTER_MAIN_TEXT);
    if (start < 0 || end < start) throw new Error(`${AOZORA_SLUG}: .main_text not found; the recording changed shape`);
    return { start, end };
}

function fulfilled(body) {
    return { status: 200, contentType: 'text/html; charset=utf-8', body };
}
