#!/usr/bin/env node
/**
 * Pre-generate character-voiced audio for Academy story dialogue via the
 * yomu-audio worker's /voice/line endpoint (per-character voices from
 * workers/yomu-audio/src/tts.ts VOICE_REGISTRY; pitch-aware Polly when
 * credentialed, Workers AI MeloTTS otherwise).
 *
 *   VOICE_ADMIN_TOKEN=... node scripts/generate-academy-voice-lines.mjs \
 *     [--worker https://audio.yomureader.com] [--dry-run] [--limit N]
 *
 * Requests each unique (speaker, ja-line) once — the worker caches R2, so
 * reruns are free — and writes public/academy/audio/voice-lines.json
 * mapping { id → { speaker, text, url } } for the AudioDirector and
 * listening activities.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const worker = args.includes("--worker") ? args[args.indexOf("--worker") + 1] : "https://audio.yomureader.com";
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const token = process.env.VOICE_ADMIN_TOKEN ?? "";
if (!token && !dryRun) {
  console.error("VOICE_ADMIN_TOKEN is required (wrangler secret on the worker). Use --dry-run to preview.");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelay(response, attempt) {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return Math.min(1_000 * (2 ** attempt), 8_000);
}

async function fetchWithRetry(url, options, label, maxAttempts = 6) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retryable || attempt === maxAttempts - 1) return response;
      await response.body?.cancel();
      const delay = retryDelay(response, attempt);
      console.warn(`RETRY ${attempt + 1}/${maxAttempts - 1} ${label}: HTTP ${response.status} in ${delay}ms`);
      await sleep(delay);
    } catch (error) {
      if (attempt === maxAttempts - 1) throw error;
      const delay = retryDelay(null, attempt);
      const code = error?.cause?.code ?? error?.code ?? error?.name ?? "network error";
      console.warn(`RETRY ${attempt + 1}/${maxAttempts - 1} ${label}: ${code} in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw new Error(`retry budget exhausted for ${label}`);
}

const SOURCES = [
  "src/academy/domain/world-locations.ts",
  "src/academy/content/aakash-meet.ts",
  "src/reader/app/academy-copy.ts",
];

/** Extract (speaker, ja) pairs: nearest preceding speakerId before a ja: '...' literal. */
function extractLines(file) {
  const text = readFileSync(join(root, file), "utf8");
  const results = [];
  const ja = /ja:\s*'([^']{4,200})'/g;
  let match;
  while ((match = ja.exec(text)) !== null) {
    const line = match[1];
    if (!/[぀-ヿ一-鿿]/.test(line)) continue;
    const before = text.slice(Math.max(0, match.index - 400), match.index);
    const speakerMatch = [...before.matchAll(/speakerId:\s*'([a-z-]+)'/g)].pop();
    results.push({ speaker: speakerMatch?.[1] ?? "narrator", text: line, file });
  }
  return results;
}

async function main() {
  const lines = SOURCES.flatMap(extractLines);
  const unique = [...new Map(lines.map((l) => [`${l.speaker}${l.text}`, l])).values()].slice(0, limit);
  console.log(`found ${unique.length} unique (speaker, line) pairs across ${SOURCES.length} files`);
  const manifest = {};
  let generated = 0;
  let failed = 0;
  for (const { speaker, text } of unique) {
    const id = createHash("sha256").update(`${speaker}${text}`).digest("hex").slice(0, 24);
    const url = `${worker}/voice/line?text=${encodeURIComponent(text)}&speaker=${encodeURIComponent(speaker)}`;
    if (!dryRun) {
      let response;
      try {
        response = await fetchWithRetry(
          url,
          { headers: { authorization: `Bearer ${token}` } },
          `${speaker}: ${text.slice(0, 24)}`,
        );
      } catch (error) {
        failed += 1;
        const code = error?.cause?.code ?? error?.code ?? error?.name ?? "network error";
        console.error(`FAILED ${code} ${speaker}: ${text.slice(0, 40)}`);
        continue;
      }
      if (!response.ok) {
        failed += 1;
        console.error(`FAILED ${response.status} ${speaker}: ${text.slice(0, 40)}`);
        continue;
      }
      await response.arrayBuffer();
      generated += 1;
      if (generated % 25 === 0) console.log(`  ${generated}/${unique.length}…`);
    }
    manifest[id] = { speaker, text, url };
  }
  const outDir = join(root, "public", "academy", "audio");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "voice-lines.json"), JSON.stringify(manifest, null, 1));
  console.log(`${dryRun ? "previewed" : `generated ${generated}, failed ${failed}`}; manifest → public/academy/audio/voice-lines.json`);
}

main();
