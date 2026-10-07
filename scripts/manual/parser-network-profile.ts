/** Bounded source-level network diagnostic, separate from hermetic unit tests. */
import { get } from 'node:https';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { JSDOM } from 'jsdom';

const { values } = parseArgs({ options: {
    text: { type: 'string', default: '冒険を始めよう。夜明けまでに港へ行くよ。' },
    stage: { type: 'string', default: 'parser' },
    out: { type: 'string', default: 'artifacts/parser-performance/profile.json' },
    help: { type: 'boolean' },
} });
if (values.help) {
    console.log('node_modules/.bin/vite-node scripts/manual/parser-network-profile.ts -- [--text Japanese] [--stage parser|public] [--out report.json]\n'
        + 'Live public Jiten requests; no keys or installed dictionaries. Source timing, not native UI proof.');
    process.exit(0);
}
if (!['parser', 'public'].includes(values.stage!)) throw new Error('Choose parser or public.');
if (values.text!.length > 6000) throw new Error('Diagnostic text is limited to 6,000 characters.');
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://parser-profile.invalid/' });
for (const name of ['window', 'document', 'location', 'navigator', 'localStorage', 'sessionStorage', 'HTMLElement', 'Element', 'Node', 'CustomEvent', 'MutationObserver']) {
    Object.defineProperty(globalThis, name, { value: dom.window[name as keyof typeof dom.window], configurable: true });
}
const { ReaderParser } = await import('../../src/reader/lookup/parser');
const { JitenPublicVocabularyClient } = await import('../../src/reader/dictionaries/jiten-public-vocabulary');
const { DEFAULT_SETTINGS } = await import('../../src/reader/settings');
const requests: Array<{ url: string; startMs: number; endMs?: number; status?: number; error?: string }> = [];
const started = performance.now();
const client = new JitenPublicVocabularyClient({ requestJsonImpl: async url => {
    if (requests.length >= 40) throw new Error('Diagnostic request cap reached.');
    const entry: (typeof requests)[number] = { url, startMs: performance.now() - started };
    requests.push(entry);
    try {
        return await new Promise((resolve, reject) => {
            const request = get(url, response => {
                entry.status = response.statusCode;
                let text = '';
                response.on('data', chunk => {
                    text += chunk;
                    if (text.length > 2_000_000) request.destroy(new Error('Diagnostic response cap reached.'));
                });
                response.on('error', reject);
                response.on('end', () => {
                    if (response.statusCode !== 200) { reject(new Error(`HTTP ${response.statusCode}`)); return; }
                    try { resolve(JSON.parse(text)); } catch (error) { reject(error); }
                });
            });
            const deadline = setTimeout(() => request.destroy(new Error('Diagnostic request timeout.')), 5000);
            request.on('close', () => clearTimeout(deadline));
            request.on('error', reject);
        });
    } catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
        throw error;
    } finally {
        entry.endMs = performance.now() - started;
    }
} });
const parser = new ReaderParser({
    getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '', localDictionariesEnabled: false, yomuLocalSrsEnabled: false }),
    jpdb: { getCard: () => undefined } as never,
    jitenPublicVocabulary: client,
    dictionaries: { hasTermDictionaries: async () => false, lookupKanji: async () => [], lookupTermMeta: async () => [] } as never,
});
const paragraphs = [values.text!];
try {
    const tokens = values.stage === 'public'
        ? await client.parse(paragraphs, { detailLimit: 0 })
        : await parser.parse(paragraphs, { allowSegmentedFallback: true, includeLocalPitch: false, publicJitenDetailLimit: 0 });
    const report = {
        environment: 'actual source + live public Jiten; simulated empty dictionary store; no DOM painting/native UI',
        stage: values.stage, elapsedMs: performance.now() - started, paragraphs, requests,
        tokens: tokens.map((group, index) => group.map(token => ({
            start: token.start, end: token.end, surface: paragraphs[index].slice(token.start, token.end),
            spelling: token.card.spelling, reading: token.card.reading, source: token.card.source,
        }))),
    };
    await mkdir(path.dirname(values.out!), { recursive: true });
    await writeFile(values.out!, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output: values.out, elapsedMs: report.elapsedMs, requests: requests.length, tokens: tokens.flat().length }));
} finally {
    dom.window.close();
}
