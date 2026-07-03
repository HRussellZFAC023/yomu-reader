#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";

const DEFAULT_SERVER = "http://localhost:9090/";
const DEFAULT_LOCAL_ROOT = "/Users/heru/Applications/yomichan-audio-server";
const DEFAULT_DB = path.join(DEFAULT_LOCAL_ROOT, "entries.db");
const DEFAULT_AUDIO_ROOT = path.join(DEFAULT_LOCAL_ROOT, "audio");
const DEFAULT_OUT_DIR = "tmp/yomu-audio-export";
const DEFAULT_INDEX_PREFIX = "index/v2/shards";
const DEFAULT_SOURCES = ["daijisen", "nhk16", "shinmeikai8", "forvo_jp", "jpod"];
const FIELD_SEPARATOR = "\u001f";

const args = parseArgs(process.argv.slice(2));

if (args.db || args.full || args["from-db"]) {
  await exportShardedIndexFromDb(args);
} else {
  await exportSeedWordsFromLocalServer(args);
}

async function exportShardedIndexFromDb(options) {
  const dbPath = path.resolve(options.db || DEFAULT_DB);
  const audioRoot = path.resolve(options.audioRoot || options["audio-root"] || DEFAULT_AUDIO_ROOT);
  const outDir = path.resolve(options.out || DEFAULT_OUT_DIR);
  const indexPrefix = trimSlashes(options.indexPrefix || options["index-prefix"] || DEFAULT_INDEX_PREFIX);
  const sources = parseSourceList(options.sources) || DEFAULT_SOURCES;
  const sourceRank = new Map(sources.map((source, index) => [source, index]));
  const shards = new Map();
  const stats = {
    rows: 0,
    skippedUnsafeFiles: 0,
    skippedMissingFiles: 0,
    checkedFiles: new Set(),
    missingFiles: new Set(),
    terms: new Set(),
    wordReadings: 0,
    files: new Set(),
  };

  await streamSqliteRows(dbPath, sources, (row) => {
    addDatabaseEntryToShards(shards, sourceRank, stats, row, {
      audioRoot,
      verifyFiles: !truthyOption(options.noVerifyFiles || options["no-verify-files"]),
    });
  });

  const shardFiles = await writeShardIndex({ shards, outDir, indexPrefix });
  const manifest = {
    version: 2,
    generatedAt: new Date().toISOString(),
    sourceDatabase: dbPath,
    audioRoot,
    indexPrefix,
    shardHash: "fnv1a32-js-code-unit-little-endian",
    shardHexChars: 3,
    sources,
    counts: {
      rows: stats.rows,
      terms: stats.terms.size,
      wordReadings: stats.wordReadings,
      files: stats.files.size,
      shards: shardFiles.length,
      skippedUnsafeFiles: stats.skippedUnsafeFiles,
      skippedMissingFiles: stats.skippedMissingFiles,
      missingFiles: stats.missingFiles.size,
    },
  };

  await mkdir(path.join(outDir, "index", "v2"), { recursive: true });
  const manifestPath = path.join(outDir, "index", "v2", "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeUploadHelpers({ outDir, audioRoot, sources });

  console.log(JSON.stringify({
    mode: "db-shards",
    outDir,
    manifest: manifestPath,
    ...manifest.counts,
  }, null, 2));
}

async function exportSeedWordsFromLocalServer(options) {
  if (!options.words) {
    console.error([
      "Usage:",
      "  npm run audio:export -- --full [--db /path/entries.db] [--audio-root /path/audio] [--out tmp/yomu-audio-export]",
      "  npm run audio:export -- --words words.tsv [--server http://localhost:9090/] [--out tmp/yomu-audio-export]",
    ].join("\n"));
    process.exit(1);
  }

  const serverUrl = options.server || DEFAULT_SERVER;
  const outDir = path.resolve(options.out || DEFAULT_OUT_DIR);
  const words = await readWords(options.words);
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
    mode: "seed-server",
    words: words.length,
    manifestEntries: Object.keys(manifest.entries).length,
    files: fileCount,
    outDir,
    manifest: path.join(outDir, "index", "audio-index.json"),
  }, null, 2));
}

function addDatabaseEntryToShards(shards, sourceRank, stats, row, options) {
  if (!sourceRank.has(row.source)) return;
  const term = normalizedText(row.expression);
  if (!term) return;
  const relativeFile = safeRelativeAudioPath(row.file);
  if (!relativeFile) {
    stats.skippedUnsafeFiles += 1;
    return;
  }

  const reading = normalizedText(row.reading);
  const shardId = audioShardId(term);
  const shard = getOrCreate(shards, shardId, () => new Map());
  const termRecords = getOrCreate(shard, term, () => new Map());
  let record = termRecords.get(reading);
  if (!record) {
    record = { reading, sources: [], seen: new Set() };
    termRecords.set(reading, record);
    stats.wordReadings += 1;
  }

  const key = `${row.source}/${relativeFile}`;
  if (options.verifyFiles && !stats.checkedFiles.has(key)) {
    stats.checkedFiles.add(key);
    if (!existsSync(path.join(options.audioRoot, key))) {
      stats.missingFiles.add(key);
      stats.skippedMissingFiles += 1;
      return;
    }
  } else if (options.verifyFiles && stats.missingFiles.has(key)) {
    stats.skippedMissingFiles += 1;
    return;
  }

  const name = audioSourceName(row);
  const dedupeKey = `${name}\t${key}`;
  if (!record.seen.has(dedupeKey)) {
    record.seen.add(dedupeKey);
    record.sources.push([name, key]);
  }

  stats.rows += 1;
  stats.terms.add(term);
  stats.files.add(key);
}

async function writeShardIndex({ shards, outDir, indexPrefix }) {
  const files = [];
  for (const [shardId, terms] of [...shards.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const entries = {};
    for (const [term, readings] of [...terms.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      entries[term] = [...readings.values()]
        .sort((left, right) => left.reading.localeCompare(right.reading))
        .map((record) => ({
          r: record.reading,
          s: record.sources,
        }));
    }
    const shardPath = path.join(outDir, indexPrefix, `${shardId}.json`);
    await mkdir(path.dirname(shardPath), { recursive: true });
    await writeFile(shardPath, `${JSON.stringify({ version: 2, shard: shardId, entries })}\n`);
    files.push(shardPath);
  }
  return files;
}

async function writeUploadHelpers({ outDir, audioRoot, sources }) {
  const rcloneFilter = [
    ...sources.map((source) => `+ /${source}/**`),
    "- **",
    "",
  ].join("\n");
  const awsIncludeFlags = sources.map((source) => `  --include "${source}/*" \\`).join("\n");
  const uploadPlan = [
    "# Yomu audio upload plan",
    "",
    "R2 bucket: yomu-audio",
    `Audio root: ${audioRoot}`,
    `Index root: ${path.join(outDir, "index")}`,
    "",
    "rclone:",
    `  rclone copy "${audioRoot}" r2:yomu-audio --filter-from "${path.join(outDir, "rclone-audio-filter.txt")}" --fast-list --transfers 32 --checkers 64 --progress`,
    `  rclone copy "${path.join(outDir, "index")}" r2:yomu-audio/index --fast-list --transfers 32 --checkers 64 --progress`,
    "",
    "aws-cli fallback:",
    "  aws s3 sync \\",
    `    "${audioRoot}" \\`,
    "    s3://yomu-audio/ \\",
    "    --endpoint-url \"https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com\" \\",
    "    --exclude \"*\" \\",
    awsIncludeFlags,
    "    --only-show-errors",
    `  aws s3 sync "${path.join(outDir, "index")}" s3://yomu-audio/index --endpoint-url "https://\${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" --only-show-errors`,
    "",
  ].join("\n");

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "rclone-audio-filter.txt"), rcloneFilter);
  await writeFile(path.join(outDir, "upload-plan.txt"), uploadPlan);
}

async function streamSqliteRows(dbPath, sources, onRow) {
  const query = [
    "select expression, coalesce(reading, ''), source, coalesce(speaker, ''), coalesce(display, ''), file",
    "from entries",
    `where source in (${sources.map(sqlString).join(", ")})`,
    `order by expression collate binary, coalesce(reading, '') collate binary, ${sourceOrderSql(sources)}, file collate binary`,
  ].join(" ");
  const child = spawn("sqlite3", ["-readonly", "-batch", "-separator", FIELD_SEPARATOR, dbPath, query], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  let spawnError;
  child.once("error", (error) => {
    spawnError = error;
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    const [expression, reading, source, speaker, display, file] = line.split(FIELD_SEPARATOR);
    if (!expression || !source || !file) continue;
    onRow({ expression, reading, source, speaker, display, file });
  }

  const exitCode = await new Promise((resolve) => {
    child.once("close", resolve);
  });
  if (spawnError) throw spawnError;
  if (exitCode !== 0) throw new Error(`sqlite3 exited with ${exitCode}: ${stderr.trim()}`);
}

function sourceOrderSql(sources) {
  const cases = sources.map((source, index) => `when ${sqlString(source)} then ${index}`).join(" ");
  return `case source ${cases} else 999 end`;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function audioSourceName(row) {
  const label = normalizedText(row.display) || normalizedText(row.speaker);
  return label ? `${row.source} ${label}` : row.source;
}

function safeRelativeAudioPath(value) {
  const relative = String(value || "").trim().replace(/\\/g, "/");
  if (!relative || relative.startsWith("/") || relative.includes("\0")) return "";
  const parts = relative.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  return parts.join("/");
}

function audioShardId(term) {
  return fnv1a32Hex(normalizedText(term)).slice(0, 3);
}

function fnv1a32Hex(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hash ^= code & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= code >>> 8;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function getOrCreate(map, key, create) {
  let value = map.get(key);
  if (!value) {
    value = create();
    map.set(key, value);
  }
  return value;
}

function normalizedText(value) {
  return String(value ?? "").trim().normalize("NFC");
}

function trimSlashes(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function parseSourceList(value) {
  if (!value) return null;
  const sources = String(value).split(",").map((source) => source.trim()).filter(Boolean);
  return sources.length ? sources : null;
}

function truthyOption(value) {
  return /^(?:1|true|yes|on)$/i.test(String(value ?? "").trim());
}

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
