#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dirname, "..");
const artRoot = join(repoRoot, "public/academy/art");
const manifestPath = join(repoRoot, "docs/academy/recovery/RECOVERED-GIT-ART-MANIFEST.json");
const imagePattern = /\.(?:png|jpe?g|webp|gif|avif)$/i;

function git(args, options = {}) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: options.binary ? null : "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

function artRelativePath(path) {
  const marker = "public/academy/art/";
  const index = path.indexOf(marker);
  if (index < 0) return null;
  let rel = path.slice(index + marker.length);
  rel = rel.replace(/^_incoming\/characters\/_legacy\//, "characters/");
  rel = rel.replace(/^_incoming\/characters\//, "characters/");
  return rel;
}

function imageExtension(content) {
  if (content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return ".jpg";
  if (content.subarray(0, 4).toString("ascii") === "RIFF" && content.subarray(8, 12).toString("ascii") === "WEBP") return ".webp";
  if (content.subarray(0, 6).toString("ascii").startsWith("GIF8")) return ".gif";
  return null;
}

async function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function currentHashes() {
  const output = spawnSync("find", [artRoot, "-type", "f"], { encoding: "utf8" }).stdout;
  const hashes = new Map();
  for (const file of output.split("\n").filter((value) => imagePattern.test(value))) {
    const content = await readFile(file);
    hashes.set(await sha256(content), relative(repoRoot, file));
  }
  return hashes;
}

function knownObjects() {
  const rows = new Map();
  const addTree = (revision) => {
    const tree = git(["ls-tree", "-r", revision]).stdout ?? "";
    for (const line of tree.split("\n")) {
      const match = line.match(/^\d+ blob ([0-9a-f]+)\t(.+)$/);
      if (!match || !imagePattern.test(match[2]) || !match[2].includes("academy")) continue;
      rows.set(`${match[1]}\0${match[2]}`, { object: match[1], path: match[2], revision });
    }
  };

  const reachable = git(["rev-list", "--objects", "--all", "--reflog"]).stdout ?? "";
  for (const line of reachable.split("\n")) {
    const match = line.match(/^([0-9a-f]+) (.+)$/);
    if (!match || !imagePattern.test(match[2]) || !match[2].includes("academy")) continue;
    rows.set(`${match[1]}\0${match[2]}`, { object: match[1], path: match[2], revision: "refs-or-reflog" });
  }

  const unreachable = git(["fsck", "--full", "--unreachable", "--no-reflogs"]).stdout ?? "";
  for (const line of unreachable.split("\n")) {
    const match = line.match(/^unreachable commit ([0-9a-f]+)$/);
    if (match) addTree(match[1]);
  }
  return [...rows.values()];
}

await mkdir(dirname(manifestPath), { recursive: true });
const hashes = await currentHashes();
const entries = [];
for (const row of knownObjects()) {
  const content = git(["cat-file", "blob", row.object], { binary: true }).stdout;
  if (!content) continue;
  const hash = await sha256(content);
  const existing = hashes.get(hash);
  const rel = artRelativePath(row.path);
  const entry = { ...row, sha256: hash, destination: existing ?? null, status: existing ? "already-present" : "catalogued" };
  if (!existing && rel) {
    let target = join(artRoot, rel);
    try {
      const current = await readFile(target);
      if ((await sha256(current)) !== hash) {
        const extension = extname(rel);
        target = join(artRoot, `${rel.slice(0, -extension.length)}__git-${hash.slice(0, 10)}${extension}`);
      }
    } catch {
      // The historical path is currently free.
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    entry.destination = relative(repoRoot, target);
    entry.status = "recovered";
    hashes.set(hash, entry.destination);
  }
  entries.push(entry);
}

const danglingRows = (git(["fsck", "--full", "--unreachable", "--no-reflogs"]).stdout ?? "")
  .split("\n")
  .map((line) => line.match(/^unreachable blob ([0-9a-f]+)$/)?.[1])
  .filter(Boolean);
for (const object of danglingRows) {
  const content = git(["cat-file", "blob", object], { binary: true }).stdout;
  if (!content) continue;
  const extension = imageExtension(content);
  if (!extension) continue;
  const hash = await sha256(content);
  const existing = hashes.get(hash);
  const entry = { object, path: null, revision: null, sha256: hash, destination: existing ?? null, status: existing ? "already-present" : "recovered-unpathed" };
  if (!existing) {
    const target = join(artRoot, "recovery/unpathed", `${hash}${extension}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    entry.destination = relative(repoRoot, target);
    hashes.set(hash, entry.destination);
  }
  entries.push(entry);
}

const unique = new Map();
for (const entry of entries) {
  const current = unique.get(entry.sha256);
  if (!current) unique.set(entry.sha256, { ...entry, histories: [{ object: entry.object, path: entry.path, revision: entry.revision }] });
  else current.histories.push({ object: entry.object, path: entry.path, revision: entry.revision });
}
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  policy: "Recover deleted and detached Academy art before any quality or runtime decision.",
  historicalOccurrences: entries.length,
  uniqueHistoricalImages: unique.size,
  recoveredImages: [...unique.values()].filter((entry) => entry.status.startsWith("recovered")).length,
  images: [...unique.values()],
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  historicalOccurrences: manifest.historicalOccurrences,
  uniqueHistoricalImages: manifest.uniqueHistoricalImages,
  recoveredImages: manifest.recoveredImages,
  manifestPath,
}, null, 2));
