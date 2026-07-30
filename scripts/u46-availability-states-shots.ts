/**
 * Renders the four U46 degradation states with the real renderer and screenshots
 * each one, so the evidence is the shipped markup and the shipped stylesheet
 * rather than a mock-up. Run with `npx vite-node scripts/u46-availability-states-shots.ts`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

import { renderExampleSourceRow } from '../src/reader/sources/examples/availability-render';
import { createTatoebaExampleSource, tatoebaCapabilitiesFor } from '../src/reader/sources/examples/tatoeba';
import { immersionKitCapabilitiesFor } from '../src/reader/sources/examples/immersion-kit';
import type { ExampleCollection, ExampleRecord } from '../src/reader/sources/examples/types';

const OUT_DIR = process.env.YOMU_SHOT_DIR ?? '/tmp/u46-shots';
const sourceAttributes = (key: string) => `data-source-state-key="${key}" open`;

const SPANISH_PAYLOAD = JSON.parse(readFileSync(join(process.cwd(), 'scripts/fixtures/u46-tatoeba-spanish.json'), 'utf8'));

async function spanishLoaded(): Promise<ExampleCollection<ExampleRecord>> {
    const source = createTatoebaExampleSource({ fetchJson: async () => SPANISH_PAYLOAD });
    return source.search({ term: 'agua', targetLanguage: 'es', outputLanguage: 'en', signal: new AbortController().signal });
}

function card(options: {
    sourceId: string;
    sourceName: string;
    targetLanguage: string;
    collection: ExampleCollection<ExampleRecord>;
    capabilities?: ReturnType<typeof tatoebaCapabilitiesFor>;
}): string {
    return renderExampleSourceRow({
        sourceId: options.sourceId,
        sourceName: options.sourceName,
        interfaceLanguage: 'en',
        targetLanguage: options.targetLanguage,
        outputLanguage: 'en',
        capabilities: options.capabilities ?? tatoebaCapabilitiesFor(options.targetLanguage),
        collection: options.collection,
        sourceAttributes,
    });
}

const states = [
    {
        name: '1-unsupported-target',
        title: 'State 1 — this source does not cover the target',
        html: card({
            sourceId: 'immersion-kit',
            sourceName: 'Immersion Kit',
            targetLanguage: 'es',
            collection: { availability: 'unsupported', items: [] },
            capabilities: immersionKitCapabilitiesFor('es'),
        }),
    },
    {
        name: '2-empty-and-limited-corpus',
        title: 'State 2 — no examples for this term (Spanish), plus the limited-corpus badge (Lao)',
        html: card({ sourceId: 'tatoeba', sourceName: 'Tatoeba', targetLanguage: 'es', collection: { availability: 'empty', items: [] } })
            + card({ sourceId: 'tatoeba-lo', sourceName: 'Tatoeba', targetLanguage: 'lo', collection: { availability: 'empty', items: [] } }),
    },
    {
        name: '3-loaded-media-withheld',
        title: 'State 3 — sentences found, audio refused by licence, no illustration anywhere',
        html: card({ sourceId: 'tatoeba', sourceName: 'Tatoeba', targetLanguage: 'es', collection: await spanishLoaded() }),
    },
    {
        name: '4-source-failed',
        title: 'State 4 — the request failed, with a retry',
        html: card({ sourceId: 'tatoeba', sourceName: 'Tatoeba', targetLanguage: 'es', collection: { availability: 'unavailable', items: [], reason: 'network' } }),
    },
];

const css = readFileSync(join(process.cwd(), 'dist/yomu.css'), 'utf8');
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 460 }, deviceScaleFactor: 2 });
for (const state of states) {
    // Rendered inside the real popover shell so the shipped CSS variables and
    // card chrome apply; only the caption is harness furniture.
    const document = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
        body { margin: 0; padding: 16px; background: var(--jpdb-reader-bg, #14161c); font-family: system-ui, sans-serif; }
        h1 { color: var(--jpdb-reader-muted); font-size: 12px; font-weight: 500; margin: 0 0 12px; }
        .jpdb-reader-popup { position: static; max-width: 520px; }
    </style></head><body class="yomu-page-theme-dark"><div data-jpdb-reader-root>
        <h1>${state.title}</h1>
        <div class="jpdb-reader-popup jpdb-reader-card"><div class="jpdb-reader-definition-stack">${state.html}</div></div>
    </div></body></html>`;
    const file = join(OUT_DIR, `${state.name}.html`);
    writeFileSync(file, document);
    await page.goto(`file://${file}`);
    await page.screenshot({ path: join(OUT_DIR, `u46-${state.name}.png`), fullPage: true });
    console.log(`[u46-shots] ${state.name}`);
}
await browser.close();
