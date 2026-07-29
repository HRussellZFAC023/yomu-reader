#!/usr/bin/env node
// Curl every recommended YouTube channel and report the dead ones.
//
// Ticket A35.7: `@cijapanese` and `@chinese-muimui` shipped as recommendations
// long after both 404'd, because the roster is hand-maintained and nothing ever
// fetched it. A learner following a dead recommendation is a broken product, and
// the failure is invisible from inside the repo.
//
// Deliberately NOT part of `check:release`. It needs the network and YouTube
// rate-limits, so putting it on the release path would make releases fail for
// reasons that have nothing to do with the release. Run it on a schedule, or by
// hand before touching the roster:
//
//   npm run check:channels            # every handle
//   npm run check:channels -- --limit 20
//
// Exits 1 when any handle is dead, so a scheduled job can surface it.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ROSTER = join(ROOT, 'src/reader/subtitles/youtube-channel-recommendations.ts');
// A channel page served to a bot differs from one served to a browser, and an
// unrecognised agent gets a consent wall that reads as a failure. Ask as Chrome.
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const CONCURRENCY = 4;
const TIMEOUT_MS = 20_000;

function handles() {
    const source = readFileSync(ROSTER, 'utf8');
    const found = [];
    // Read the literal rather than importing: the module is browser-oriented TypeScript.
    for (const match of source.matchAll(/\{\s*handle:\s*'(@[^']+)',\s*name:\s*'([^']*)'/g)) {
        found.push({ handle: match[1], name: match[2] });
    }
    return found;
}

async function channelStatus(handle) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(`https://www.youtube.com/${handle}`, {
            redirect: 'follow',
            headers: { 'user-agent': USER_AGENT, 'accept-language': 'en' },
            signal: controller.signal,
        });
        return { status: response.status };
    } catch (error) {
        return { status: 0, error: error instanceof Error ? error.message : String(error) };
    } finally {
        clearTimeout(timer);
    }
}

async function main() {
    const limitArg = process.argv.indexOf('--limit');
    const all = handles();
    const roster = limitArg > -1 ? all.slice(0, Number(process.argv[limitArg + 1]) || all.length) : all;
    if (!roster.length) {
        console.error('[channels] no handles parsed — did the roster literal change shape?');
        process.exit(1);
    }
    console.log(`[channels] checking ${roster.length} of ${all.length} handles`);

    const dead = [];
    const queue = [...roster];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
            const { status, error } = await channelStatus(item.handle);
            if (status === 200) continue;
            // A network blip is not a dead channel; say which it was.
            dead.push({ ...item, status, error });
            console.log(`[channels] ${status || 'ERR'}  ${item.handle}  (${item.name})${error ? ` ${error}` : ''}`);
        }
    });
    await Promise.all(workers);

    if (!dead.length) {
        console.log(`[channels] all ${roster.length} handles resolve`);
        return;
    }
    console.error(`\n[channels] ${dead.length} handle(s) did not resolve:`);
    for (const item of dead) console.error(`  ${item.handle} — ${item.name} (${item.status || item.error})`);
    console.error('\nFind the live handle (a renamed channel keeps its old /c/ URL, whose canonicalBaseUrl');
    console.error('names the new handle) or drop the entry. Never point a learner at a 404.');
    process.exit(1);
}

await main();
