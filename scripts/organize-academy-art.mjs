#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const artRoot = path.join(repoRoot, "public/academy/art");
const recoveryDocsRoot = path.join(repoRoot, "docs/academy/recovery");
const manifestPath = path.join(recoveryDocsRoot, "ACADEMY-ART-CATALOG.json");
const metadataRoot = path.join(recoveryDocsRoot, "art-source-metadata");
const cleanup = process.argv.includes("--cleanup");
const catalogOnly = process.argv.includes("--catalog-only");

if (cleanup && catalogOnly) {
  throw new Error("--cleanup and --catalog-only cannot be used together.");
}

const imagePattern = /\.(?:png|jpe?g|webp|gif)$/i;
const characterAliases = new Map([
  ["angel", "onke"],
  ["robert-genki", "robert"],
  ["tom", "tom1"],
]);
const characterNames = new Set([
  "aakash",
  "alex",
  "angel",
  "christian",
  "felix",
  "francis",
  "henry",
  "jenny",
  "jodi",
  "ken",
  "leo",
  "mary",
  "mika",
  "miller",
  "nanako",
  "noa",
  "nori",
  "onke",
  "peter",
  "pho",
  "remi",
  "rie",
  "robert",
  "robert-genki",
  "rose",
  "ruparna",
  "sam",
  "sato",
  "shaun",
  "shin",
  "sophie",
  "stasi",
  "steve",
  "suzu",
  "tawapon",
  "tom",
  "tom1",
  "tom2",
  "xingyu",
  "yamashita",
]);

const sourceRoots = [
  "_incoming",
  "review-recovered",
  "codex-production-v1",
  "codex-production-v2",
  "claude-production-v3",
  "recovery",
  "characters/claude-production",
  "characters/production",
  "characters/portraits",
  "characters/sprites",
  "characters/christian-electric-fan-pose",
  "characters/event-ceramics-rie",
  "characters/event-first-term-pub",
  "characters/event-rainy-station",
  "characters/lesson-scene-archive",
  "characters/location-seasonal-plates",
  "characters/angel",
  "characters/tom",
  "characters/alex/candidates",
  "characters/sophie/candidates-v004",
  "locations/mobile/legacy-generated-20260718",
  "environments",
].map((relative) => ({ relative, absolute: path.join(artRoot, relative) }));

const manifest = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  policy:
    "One canonical folder per person or purpose. Preserve provenance in this catalog.",
  mode: catalogOnly ? "catalog-only" : "organize",
  cleanupRequested: cleanup,
  copied: [],
  deduplicated: [],
  metadata: [],
  unresolved: [],
  removedSourceRoots: [],
  canonicalImages: [],
};

const hashCache = new Map();
const destinationHashes = new Map();

async function sha256(file) {
  const cached = hashCache.get(file);
  if (cached) return cached;
  const hash = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
  hashCache.set(file, hash);
  return hash;
}

async function walk(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const absolute = path.join(root, entry.name);
      if (entry.isDirectory()) files.push(...(await walk(absolute)));
      else files.push(absolute);
    }
    return files;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function slug(value) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function cleanDescriptor(
  file,
  sourceLabel = path.basename(file, path.extname(file)),
) {
  let value = sourceLabel.replace(path.extname(file), "").toLowerCase();
  value = value
    .replace(/__from-codex-[0-9a-f-]+(?:-[0-9a-f]+)?$/i, "")
    .replace(/__from-[0-9a-f]+$/i, "")
    .replace(/__recovered-[0-9a-f]+$/i, "")
    .replace(
      /(?:^|[-_])(legacy|recovered|rejected|candidate|approved|deprecated)(?=[-_]|$)/gi,
      "-",
    )
    .replace(/(?:^|[-_])from-git-stash(?=[-_]|$)/gi, "-")
    .replace(/(?:^|[-_])style-locked-\d+(?=[-_]|$)/gi, "-")
    .replace(/(?:^|[-_])review(?=[-_]|$)/gi, "-")
    .replace(/(?:^|[-_])sprite(?=[-_]|$)/gi, "-")
    .replace(/(?:^|[-_])source(?=[-_]|$)/gi, "-source-")
    .replace(/(?:^|[-_])raw(?=[-_]|$)/gi, "-source-")
    .replace(/[-_]+v\d+(?=[-_]|$)/gi, "-")
    .replace(/[-_]+/g, "-");
  return slug(value) || "artwork";
}

function inferCharacter(relative) {
  const segments = relative.toLowerCase().split(path.sep).map(slug);
  const filename = slug(path.basename(relative, path.extname(relative)));
  for (const name of characterNames) {
    if (
      segments.includes(name) ||
      filename === name ||
      filename.startsWith(`${name}-`) ||
      filename.startsWith(`${name}__`)
    ) {
      return characterAliases.get(name) ?? name;
    }
  }
  if (/christian-electric-fan/.test(relative.toLowerCase())) return "christian";
  return null;
}

function inferRoute(relative) {
  const lower = relative.toLowerCase();
  const character = inferCharacter(relative);
  if (character && !/(?:event|cinematic|class-group|ensemble)/.test(lower)) {
    return {
      directory: path.join(artRoot, "characters", character),
      prefix: character,
      subject: `characters/${character}`,
    };
  }
  if (
    /(?:contact.?sheet|gallery|class-group|quality-|anime-ref|style-|reference)/.test(
      lower,
    )
  ) {
    return {
      directory: path.join(artRoot, "reference-sheets"),
      prefix: "reference",
      subject: "reference-sheets",
    };
  }
  if (/(?:event|cinematic|ceramics|first-term-pub|rainy-station)/.test(lower)) {
    return {
      directory: path.join(artRoot, "events"),
      prefix: "event",
      subject: "events",
    };
  }
  if (
    /(?:lesson|class-activit|worksheet|ramen-counter|vegetable-market|route-map|listening-surprise)/.test(
      lower,
    )
  ) {
    return {
      directory: path.join(artRoot, "lesson-scenes"),
      prefix: "lesson",
      subject: "lesson-scenes",
    };
  }
  if (
    /(?:background|environment|location|seasonal|classroom|station|street|library|cafe|ramen|home|pub|temple|shinkansen|market)/.test(
      lower,
    )
  ) {
    const format = /mobile/.test(lower)
      ? "mobile"
      : /wide/.test(lower)
        ? "wide"
        : "source";
    return {
      directory: path.join(artRoot, "locations", format),
      prefix: "location",
      subject: `locations/${format}`,
    };
  }
  if (/(?:prop|item|thermos|ticket|stamp|book|card)/.test(lower)) {
    return {
      directory: path.join(artRoot, "items"),
      prefix: "item",
      subject: "items",
    };
  }
  if (/protagonist/.test(lower)) {
    return {
      directory: path.join(artRoot, "protagonists"),
      prefix: "protagonist",
      subject: "protagonists",
    };
  }
  return {
    directory: path.join(artRoot, "unassigned"),
    prefix: "unassigned",
    subject: "unassigned",
  };
}

async function seedDestinationHashes(directory) {
  for (const file of await walk(directory)) {
    if (imagePattern.test(file))
      destinationHashes.set(await sha256(file), file);
  }
}

async function uniqueDestination(directory, stem, extension, hash) {
  const duplicate = destinationHashes.get(hash);
  if (duplicate) return { path: duplicate, duplicate: true };
  for (let version = 1; version < 10_000; version += 1) {
    const candidate = path.join(
      directory,
      `${stem}__v${String(version).padStart(3, "0")}${extension}`,
    );
    try {
      await stat(candidate);
      if ((await sha256(candidate)) === hash)
        return { path: candidate, duplicate: true };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return { path: candidate, duplicate: false };
    }
  }
  throw new Error(`Unable to allocate a filename for ${stem}`);
}

async function promoteImage(source, sourceRoot) {
  const relativeSource = path.relative(repoRoot, source);
  const route = inferRoute(path.relative(sourceRoot, source));
  const hash = await sha256(source);
  await mkdir(route.directory, { recursive: true });
  await seedDestinationHashes(route.directory);
  const descriptor = cleanDescriptor(
    source,
    path.basename(sourceRoot) === "environments"
      ? path.relative(sourceRoot, source)
      : undefined,
  );
  const character = route.subject.startsWith("characters/")
    ? route.subject.split("/")[1]
    : null;
  const withoutRepeatedCharacter = character
    ? descriptor.replace(new RegExp(`^${character}(?:-genki)?-?`), "") ||
      "artwork"
    : descriptor;
  const extension = path.extname(source).toLowerCase().replace(".jpeg", ".jpg");
  const stem = `${route.prefix}__${withoutRepeatedCharacter}`;
  const destination = await uniqueDestination(
    route.directory,
    stem,
    extension,
    hash,
  );
  const record = {
    sha256: hash,
    subject: route.subject,
    source: relativeSource,
    destination: path.relative(repoRoot, destination.path),
  };
  if (destination.duplicate) {
    manifest.deduplicated.push(record);
    return destination.path;
  }
  await copyFile(source, destination.path);
  if ((await sha256(destination.path)) !== hash)
    throw new Error(`Hash verification failed: ${destination.path}`);
  destinationHashes.set(hash, destination.path);
  manifest.copied.push(record);
  return destination.path;
}

async function preserveMetadata(source, rootRelative, rootAbsolute) {
  const relative = path.relative(rootAbsolute, source);
  const destination = path.join(metadataRoot, slug(rootRelative), relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  const sourceHash = await sha256(source);
  if ((await sha256(destination)) !== sourceHash)
    throw new Error(`Metadata hash verification failed: ${destination}`);
  manifest.metadata.push({
    sha256: sourceHash,
    source: path.relative(repoRoot, source),
    destination: path.relative(repoRoot, destination),
  });
}

if (!catalogOnly) {
  for (const sourceRoot of sourceRoots) {
    const files = await walk(sourceRoot.absolute);
    if (files.length === 0) continue;
    for (const file of files) {
      if (imagePattern.test(file))
        await promoteImage(file, sourceRoot.absolute);
      else
        await preserveMetadata(file, sourceRoot.relative, sourceRoot.absolute);
    }

    if (cleanup) {
      for (const file of files) {
        const hash = await sha256(file);
        const records = [
          ...manifest.copied,
          ...manifest.deduplicated,
          ...manifest.metadata,
        ];
        if (!records.some((record) => record.sha256 === hash)) {
          throw new Error(
            `Refusing cleanup; no verified destination for ${file}`,
          );
        }
      }
      await rm(sourceRoot.absolute, { recursive: true, force: true });
      manifest.removedSourceRoots.push(
        path.relative(repoRoot, sourceRoot.absolute),
      );
    }
  }
}

const firstPathByHash = new Map();
for (const file of (await walk(artRoot))
  .filter((candidate) => imagePattern.test(candidate))
  .sort()) {
  const hash = await sha256(file);
  const relative = path.relative(repoRoot, file);
  const duplicateOf = firstPathByHash.get(hash) ?? null;
  if (!duplicateOf) firstPathByHash.set(hash, relative);
  const fileStat = await stat(file);
  const relativeToArt = path.relative(artRoot, file);
  const [collection, subject] = relativeToArt.split(path.sep);
  manifest.canonicalImages.push({
    path: relative,
    sha256: hash,
    bytes: fileStat.size,
    collection,
    subject: subject ?? collection,
    ...(duplicateOf ? { duplicateOf } : {}),
  });
}

await mkdir(path.dirname(manifestPath), { recursive: true });
await writeFile(
  manifestPath,
  await format(JSON.stringify(manifest), { parser: "json" }),
);

console.log(
  JSON.stringify(
    {
      copied: manifest.copied.length,
      deduplicated: manifest.deduplicated.length,
      metadataPreserved: manifest.metadata.length,
      removedSourceRoots: manifest.removedSourceRoots.length,
      canonicalImages: manifest.canonicalImages.length,
      duplicateCanonicalImages: manifest.canonicalImages.filter(
        (image) => image.duplicateOf,
      ).length,
      manifestPath,
    },
    null,
    2,
  ),
);
