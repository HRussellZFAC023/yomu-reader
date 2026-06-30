#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SERVER = "http://localhost:9090/";
const DEFAULT_OUT_DIR = "tmp/yomu-audio-export";

const args = parseArgs(process.argv.slice(2));
if (!args.words) {
  console.error("Usage: node scripts/export-yomu-audio-from-local.mjs --words words.tsv [--server http://localhost:9090/] [--out tmp/yomu-audio-export]");
  process.exit(1);
}

const serverUrl = args.server || DEFAULT_SERVER;
const outDir = path.resolve(args.out || DEFAULT_OUT_DIR);
const words = await readWords(args.words);
const manifest = { version: 1, generatedAt: new Date().toISOString(), entries: {} };
let fileCount = 0;

for (const word of words) {
  const response = await fetchAudioList(serverUrl, word.term, word.reading);
  const sources = Array.isArray(response.audioSources) ? response.audioSources : [];
  const exported = [];
  for (const source of sources) {
    const audioUrl = typeof source?.url === "string" ? source.url : "";
    const key = audioKeyFromLocalUrl(audioUrl);
    if (!key) continue;
    await downloadAudio(audioUrl, path.join(outDir, key));
    exported.push({ name: String(source.name || key), path: key });
    fileCount += 1;
  }
  if (exported.length) manifest.entries[`${word.term}\t${word.reading}`] = exported;
}

await mkdir(path.join(outDir, "index"), { recursive: true });
await writeFile(path.join(outDir, "index", "audio-index.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  words: words.length,
  manifestEntries: Object.keys(manifest.entries).length,
  files: fileCount,
  outDir,
  manifest: path.join(outDir, "index", "audio-index.json"),
}, null, 2));

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    parsed[key] = values[index + 1] && !values[index + 1].startsWith("--") ? values[++index] : "1";
  }
  return parsed;
}

async function readWords(filePath) {
  const text = await readFile(filePath, "utf8");
  return text.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [term = "", reading = ""] = line.split(/\t|,/u).map((part) => part.trim());
      return { term, reading };
    })
    .filter((word) => word.term);
}

async function fetchAudioList(server, term, reading) {
  const url = new URL(server);
  url.searchParams.set("term", term);
  url.searchParams.set("reading", reading);
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Audio list failed for ${term} (${response.status})`);
  return await response.json();
}

function audioKeyFromLocalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return "";
    const key = decodeURIComponent(url.pathname.replace(/^\/audio\/+/u, "").replace(/^\/+/u, ""));
    return key && !key.includes("..") ? key : "";
  } catch {
    return "";
  }
}

async function downloadAudio(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Audio download failed for ${url} (${response.status})`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
}
