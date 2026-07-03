// Deterministic render harness for the study-flow screenshots. Drives the real
// NewTabController in jsdom with a seeded 飲み物 card (kanji + pitch + sentence)
// and writes standalone HTML snapshots (built CSS inlined) for each step, which
// scripts/study-flow-screenshots.mjs then screenshots in a real browser. This
// sidesteps the app's live card-loading/starter-word fallback.
import { JSDOM } from 'jsdom';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, '..', '..', 'qa-artifacts', 'yomu-reader', 'study-flow', process.argv[2] ?? 'after', 'html');
const CSS = readFileSync(path.join(ROOT, 'dist', 'newtab', 'styles.css'), 'utf8');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.HTMLCanvasElement = dom.window.HTMLCanvasElement;
g.Node = dom.window.Node;
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
// Cross-realm: reuse jsdom's DOM/event constructors so addEventListener option
// objects (AbortSignal) validate against the same realm.
for (const key of ['AbortController', 'AbortSignal', 'Event', 'EventTarget', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'PointerEvent', 'Element', 'DocumentFragment', 'Image', 'DOMParser'] as const) {
    const value = (dom.window as unknown as Record<string, unknown>)[key];
    if (value) { try { Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); } catch { /* ignore */ } }
}
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* read-only navigator is fine */ }
class NoopObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
g.ResizeObserver = (dom.window as unknown as { ResizeObserver?: unknown }).ResizeObserver ?? NoopObserver;
g.MutationObserver = dom.window.MutationObserver ?? NoopObserver;
g.IntersectionObserver = (dom.window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver ?? NoopObserver;
g.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
g.matchMedia = dom.window.matchMedia ?? (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
// Alias every HTML*Element / SVG*Element constructor from jsdom so instanceof
// checks in the controller resolve against the render realm.
for (const key of Object.getOwnPropertyNames(dom.window)) {
    if ((/^(HTML|SVG).*Element$/u.test(key) || key === 'Blob' || key === 'File' || key === 'FormData' || key === 'URL' || key === 'URLSearchParams') && !(key in globalThis)) {
        try { Object.defineProperty(globalThis, key, { value: (dom.window as unknown as Record<string, unknown>)[key], configurable: true, writable: true }); } catch { /* ignore */ }
    }
}
// Doodle canvas + audio stubs so the kanji step installs without jsdom errors.
(dom.window.HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ({
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, save() {}, restore() {},
    setTransform() {}, scale() {}, arc() {}, fill() {}, closePath() {}, getImageData: () => ({ data: [] }),
    putImageData() {}, drawImage() {}, fillRect() {}, canvas: dom.window.document.createElement('canvas'),
});
(dom.window.HTMLCanvasElement.prototype as unknown as { toDataURL: () => string }).toDataURL = () => 'data:image/png;base64,';

const { NewTabController } = await import('../src/reader/newtab/controller.ts');
const { pitchPatternFromPosition } = await import('../src/reader/lookup/pitch-accent.ts');
const { DEFAULT_SETTINGS } = await import('../src/reader/settings/index.ts');

const CARD = {
    vid: 501, sid: 1, rid: 0, spelling: '飲み物', reading: 'のみもの', frequencyRank: 1500,
    partOfSpeech: ['n'], meanings: [{ glosses: ['drink', 'beverage'], partOfSpeech: ['n'] }],
    cardState: ['due'], pitchAccent: [pitchPatternFromPosition('のみもの', 3)], wordWithReading: null,
    kanjiKeyword: 'drink', source: 'jpdb', reviewSource: 'jpdb-api', sentence: '冷たい飲み物が欲しい。',
} as never;

const settings = {
    ...DEFAULT_SETTINGS, interfaceLanguage: 'en', enableReviews: true, jpdbMiningEnabled: true,
    apiKey: 'k', newTabStudyTourSeen: true, newTabFrontSentenceEnabled: true, showPitchAccent: true,
    audioEnabled: true, newTabStudyDisabledSteps: [],
};

function makeRoot() {
    const root = dom.window.document.createElement('main');
    root.className = 'jpdb-reader-newtab';
    root.dataset.jpdbReaderRoot = 'true';
    root.innerHTML = `
        <section class="jpdb-reader-newtab-study" data-newtab-study>
            <div class="jpdb-reader-newtab-study-steps" data-newtab-study-steps role="list"></div>
            <div data-newtab-study-tour hidden></div>
            <div data-newtab-count></div>
            <h1 class="jpdb-reader-newtab-prompt" data-newtab-prompt></h1>
            <div class="jpdb-reader-newtab-reading" data-newtab-reading></div>
            <div class="jpdb-reader-newtab-meaning" data-newtab-meaning></div>
            <button class="jpdb-reader-newtab-status" data-newtab-status></button>
            <nav class="jpdb-reader-newtab-controls" data-newtab-controls aria-label="Study navigation"></nav>
            <button data-newtab-action="reveal"></button>
        </section>`;
    dom.window.document.body.replaceChildren(root);
    return root;
}

function controller(mode: string) {
    const c = new NewTabController({
        getSettings: () => settings, anki: {}, jpdb: { reviewCard: async () => undefined }, jiten: {},
        jpdbKanji: { lookup: async () => null }, kanjiVG: {}, rtk: {}, immersionKit: {},
        jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: false }), reveal: () => {}, grade: () => {}, requestCurrent: () => {} },
        parser: {}, dictionaries: {}, onSettingsChange: async () => {}, applyTheme: () => {}, showSettings: () => {},
        dismiss: () => {}, dismissLookup: () => {}, toast: () => {}, playWordAudio: async () => undefined,
    } as never) as unknown as {
        allWords: unknown[]; visibleWords: unknown[]; index: number; reviewCountMode: boolean; state: Record<string, unknown>;
        studyHintDepth: Map<string, number>; renderWord(r: unknown, card: unknown): void; pickListenPosition(p: number): void;
    };
    c.allWords = [CARD]; c.visibleWords = [CARD]; c.index = 0; c.reviewCountMode = true;
    c.state = { mode, listenSubMode: mode === 'listen' ? 'perceive' : 'perceive', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false, jpdbDeck: '', ankiDeck: '', keyHintsDismissed: false };
    return c;
}

function snapshot(name: string, root: HTMLElement) {
    // The standalone snapshot lacks the real page's styled footer controls, so
    // [data-newtab-status]/[data-newtab-controls] render as raw run-together
    // text. Hide those chrome slots so the snapshot shows only the styled study
    // step (stepper, prompt, and per-step answer UI).
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
      body{margin:0;background:#0f1115}
      .wrap{max-width:760px;margin:0 auto;padding:28px 24px 32px}
      [data-newtab-status]{display:none!important}
      .jpdb-reader-newtab-study>[data-newtab-action="reveal"]{display:none!important}</style></head>
      <body><div class="wrap">${root.outerHTML}</div></body></html>`;
    writeFileSync(path.join(OUT_DIR, `${name}.html`), html);
}

mkdirSync(OUT_DIR, { recursive: true });

// Kanji-draw step (meaning + cloze front)
{
    const c = controller('kanji');
    const root = makeRoot();
    c.renderWord(root, CARD);
    snapshot('kanji-draw', root);
    // With one hint revealed.
    c.studyHintDepth.set(`${(CARD as { vid: number }).vid}:${(CARD as { sid: number }).sid}:飲み物:のみもの|kanji-doodle:0:飲`, 1);
    c.renderWord(root, CARD);
    snapshot('kanji-draw-hint', root);
}

// Word step (read the word in context)
{
    const c = controller('word');
    const root = makeRoot();
    c.renderWord(root, CARD);
    snapshot('word', root);
}

// Recall step (meaning-cloze: sentence with the target word blanked out)
{
    const c = controller('recall');
    const root = makeRoot();
    c.renderWord(root, CARD);
    snapshot('recall-cloze', root);
}

// Pitch-selection step (perceive)
{
    const c = controller('listen');
    const root = makeRoot();
    c.state.mode = 'listen';
    c.renderWord(root, CARD);
    snapshot('pitch-select', root);
}

// Shadow step (speaking sub-mode)
{
    const c = controller('listen');
    const root = makeRoot();
    c.state.mode = 'listen';
    c.state.listenSubMode = 'shadow';
    c.renderWord(root, CARD);
    snapshot('shadow', root);
}

// Final reveal (hint summary visible after a hint was used)
{
    const c = controller('kanji');
    const root = makeRoot();
    c.studyHintDepth.set(`${(CARD as { vid: number }).vid}:${(CARD as { sid: number }).sid}:飲み物:のみもの|kanji-doodle:0:飲`, 1);
    c.renderWord(root, CARD);
    c.state.revealAnswer = true;
    c.renderWord(root, CARD);
    snapshot('reveal', root);
}

console.log(JSON.stringify({ outDir: OUT_DIR }, null, 2));
process.exit(0);
