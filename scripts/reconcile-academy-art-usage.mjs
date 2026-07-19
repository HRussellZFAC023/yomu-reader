#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const publicRoot = path.join(repoRoot, "public");
const artRoot = path.join(publicRoot, "academy/art");
const usagePath = path.join(artRoot, "ASSET-USAGE.json");
const usageMirrorPath = path.join(
  repoRoot,
  "docs/public/academy/art/ASSET-USAGE.json",
);
const catalogPath = path.join(
  repoRoot,
  "docs/academy/recovery/ACADEMY-ART-CATALOG.json",
);
const collectionId = "recovered-art-review-collection-v1";
const imagePattern = /\.(?:gif|jpe?g|png|webp)$/i;

function walk(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : [target];
    });
}

function sha256(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function deliveryPath(file) {
  return `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
}

function isRuntimeAsset(asset) {
  return (
    asset.verdict.startsWith("approved-runtime") ||
    asset.verdict === "review-candidate/runtime-preview"
  );
}

const usage = JSON.parse(fs.readFileSync(usagePath, "utf8"));
if (usage.rules?.directoryApprovalForbidden !== true) {
  throw new Error(
    "Refusing reconciliation unless directoryApprovalForbidden remains true.",
  );
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
if (catalog.mode !== "catalog-only") {
  throw new Error(
    "Refresh ACADEMY-ART-CATALOG.json with --catalog-only before reconciling usage.",
  );
}

const catalogHashes = new Map(
  catalog.canonicalImages.map((image) => [image.path, image.sha256]),
);
const retainedAssets = usage.assets.filter(
  (asset) => asset.id !== collectionId,
);
const accountedPaths = new Set();
for (const asset of retainedAssets) {
  for (const delivery of asset.deliveries ?? []) {
    if (accountedPaths.has(delivery.path))
      throw new Error(`Duplicate ledger delivery: ${delivery.path}`);
    accountedPaths.add(delivery.path);
  }
}

const deliveries = walk(artRoot)
  .filter((file) => path.basename(file) !== "ASSET-USAGE.json")
  .map((file) => ({ file, path: deliveryPath(file) }))
  .filter((delivery) => !accountedPaths.has(delivery.path))
  .map((delivery) => {
    const digest = sha256(delivery.file);
    if (imagePattern.test(delivery.file)) {
      const catalogKey = path
        .relative(repoRoot, delivery.file)
        .split(path.sep)
        .join("/");
      if (catalogHashes.get(catalogKey) !== digest) {
        throw new Error(
          `Recovery catalog is missing or stale for ${catalogKey}`,
        );
      }
    }
    return { path: delivery.path, sha256: digest };
  })
  .sort((left, right) => left.path.localeCompare(right.path, "en"));

const collection = {
  id: collectionId,
  source: "catalog:docs/academy/recovery/ACADEMY-ART-CATALOG.json",
  sourceSha256: sha256(catalogPath),
  provenance: "recovered-user-art-path-and-sha-inventory",
  privacy:
    "mixed recovered art; review-only; physical presence does not authorize runtime",
  verdict: "review-candidate/non-runtime",
  runtimeHome: [],
  reviewHome: ["review:asset-grader", "recovery:preserved-art-corpus"],
  usage: {
    runtime: [],
    review: ["asset-grader", "recovery-catalog"],
  },
  orphan: "review-bound",
  deliveries,
  status:
    "preserved-in-place; collection-inventory-only; no-directory-approval; not-runtime-bound",
};

const nextUsage = { ...usage, assets: [...retainedAssets, collection] };
const runtimeAssets = nextUsage.assets.filter(isRuntimeAsset);
const visualRuntimeAssets = runtimeAssets.filter((asset) =>
  (asset.deliveries ?? []).some(
    (delivery) => !delivery.path.endsWith(".json"),
  ),
);
const visualRuntimeFiles = runtimeAssets
  .flatMap((asset) => asset.deliveries ?? [])
  .filter((delivery) => !delivery.path.endsWith(".json"));
nextUsage.counts.runtimeAssetHomes = visualRuntimeAssets.length;
nextUsage.counts.runtimeFiles = visualRuntimeFiles.length;
nextUsage.counts.nonRuntimeReviewFiles = nextUsage.assets
  .filter(
    (asset) =>
      !runtimeAssets.includes(asset) &&
      asset.verdict.includes("review-candidate"),
  )
  .flatMap((asset) => asset.deliveries ?? [])
  .filter((delivery) =>
    fs.existsSync(path.join(publicRoot, delivery.path.replace(/^\//, ""))),
  ).length;

const serialized = await format(JSON.stringify(nextUsage), { parser: "json" });
fs.writeFileSync(usagePath, serialized);
fs.writeFileSync(usageMirrorPath, serialized);

console.log(
  JSON.stringify(
    {
      collectionId,
      recoveredReviewFiles: deliveries.length,
      nonRuntimeReviewFiles: nextUsage.counts.nonRuntimeReviewFiles,
      totalPublicArtFiles: walk(artRoot).filter(
        (file) => path.basename(file) !== "ASSET-USAGE.json",
      ).length,
      directoryApprovalForbidden: nextUsage.rules.directoryApprovalForbidden,
    },
    null,
    2,
  ),
);
