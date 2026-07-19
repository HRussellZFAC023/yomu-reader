#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dirname, "..");
const projectRoot = resolve(repoRoot, "../..");
const homeRoot = homedir();
const artRoot = join(repoRoot, "public/academy/art");
const manifestPath = join(repoRoot, "docs/academy/recovery/RECOVERED-ART-MANIFEST.json");
const roots = [
  join(homeRoot, ".codex/worktrees"),
  join(homeRoot, "Documents/Codex"),
  join(projectRoot, "release-worktrees"),
  join(projectRoot, "artifacts/yomu-academy"),
  join(projectRoot, "apps/yomu-academy"),
];
const imagePattern = /\.(?:png|jpe?g|webp|gif|avif)$/i;

function filesUnder(root) {
  const result = spawnSync("find", [root, "-type", "f"], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return result.stdout.split("\n").filter((file) => imagePattern.test(file));
}

function canonicalRelativePath(source) {
  const marker = "/public/academy/art/";
  const markerIndex = source.indexOf(marker);
  if (markerIndex >= 0) {
    let rel = source.slice(markerIndex + marker.length);
    rel = rel.replace(/^_incoming\/characters\/_legacy\//, "characters/");
    rel = rel.replace(/^_incoming\/characters\//, "characters/");
    if (!rel.startsWith("_incoming/")) return rel;
  }

  const taskDir = source.match(/\/Documents\/Codex\/[^/]+\/([^/]+)\//)?.[1];
  if (taskDir?.includes("academy-art-")) {
    const character = taskDir
      .replace(/^academy-art-/, "")
      .replace(/-(?:v\d+|expression|family|recovery|expansion|variants?).*$/, "");
    return `characters/${character}/${basename(source)}`;
  }

  return null;
}

function collisionName(rel, hash) {
  const extension = extname(rel);
  return `${rel.slice(0, -extension.length)}__recovered-${hash.slice(0, 10)}${extension}`;
}

await mkdir(dirname(manifestPath), { recursive: true });
const existingByHash = new Map();
for (const file of filesUnder(artRoot)) {
  const content = await readFile(file);
  const hash = createHash("sha256").update(content).digest("hex");
  existingByHash.set(hash, relative(repoRoot, file));
}

const sources = roots.flatMap((root) => filesUnder(root));
const entries = [];
for (const source of sources) {
  if (source.startsWith(`${artRoot}/`)) continue;
  const content = await readFile(source);
  const hash = createHash("sha256").update(content).digest("hex");
  const requestedRel = canonicalRelativePath(source);
  const existing = existingByHash.get(hash);
  const entry = {
    sha256: hash,
    source,
    requestedDestination: requestedRel ? `public/academy/art/${requestedRel}` : null,
    destination: existing ?? null,
    status: existing ? "already-present" : requestedRel ? "pending-copy" : "catalogued-unclassified",
  };

  if (!existing && requestedRel) {
    let target = join(artRoot, requestedRel);
    try {
      const targetContent = await readFile(target);
      const targetHash = createHash("sha256").update(targetContent).digest("hex");
      if (targetHash !== hash) target = join(artRoot, collisionName(requestedRel, hash));
    } catch {
      // The requested destination is free.
    }
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    entry.destination = relative(repoRoot, target);
    entry.status = "recovered";
    existingByHash.set(hash, entry.destination);
  }
  entries.push(entry);
}

const unique = new Map();
for (const entry of entries) {
  const current = unique.get(entry.sha256);
  if (!current) {
    unique.set(entry.sha256, { ...entry, sources: [entry.source] });
  } else {
    current.sources.push(entry.source);
    if (!current.destination && entry.destination) {
      current.destination = entry.destination;
      current.status = entry.status;
    }
  }
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  policy: "Recover every historical Academy image before any quality or runtime decision.",
  scannedRoots: roots,
  sourceFileCount: entries.length,
  uniqueImageCount: unique.size,
  recoveredImageCount: [...unique.values()].filter((entry) => entry.status === "recovered").length,
  unclassifiedImageCount: [...unique.values()].filter((entry) => entry.status === "catalogued-unclassified").length,
  images: [...unique.values()].sort((a, b) => a.source.localeCompare(b.source)),
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  sourceFileCount: manifest.sourceFileCount,
  uniqueImageCount: manifest.uniqueImageCount,
  recoveredImageCount: manifest.recoveredImageCount,
  unclassifiedImageCount: manifest.unclassifiedImageCount,
  manifestPath,
}, null, 2));
