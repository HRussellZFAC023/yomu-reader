import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  defaultAcquisitionPath,
  defaultManifestRoot,
  defaultUpstreamCoveragePath,
  readJson,
} from './lib.mjs';
import { defaultWtySnapshotPath } from './wty-release.mjs';
import { generateRecommendationMatrix } from './recommendation-pairs.mjs';

export function wtyAcquisitionSource(snapshot, artifact) {
  return {
    id: artifact.id,
    url: archiveUrl(snapshot, artifact),
    filename: artifact.filename,
    acquisitionReview: 'allowed',
    redistributionReview: 'allowed',
    sha256: artifact.sha256,
    bytes: artifact.bytes,
  };
}

export function wtyCatalogEntry(snapshot, artifact) {
  const label = artifact.variant === 'ipa' ? 'IPA' : artifact.variant === 'gloss' ? 'gloss' : 'terms';
  const url = archiveUrl(snapshot, artifact);
  return {
    id: artifact.id,
    title: `[${artifact.headwordLanguage.toUpperCase()}-${artifact.definitionLanguage.toUpperCase()}] Wiktionary (${label})`,
    installedTitle: artifact.id,
    format: 'yomitan',
    version: snapshot.datasetCommit.slice(0, 12),
    categories: [artifact.category],
    headwordLanguages: [artifact.headwordLanguage],
    definitionLanguages: [artifact.definitionLanguage],
    source: {
      acquisitionId: artifact.id,
      url,
      projectUrl: 'https://github.com/yomidevs/wiktionary-to-yomitan',
      catalogueSection: 'wiktionary-multilingual',
    },
    license: {
      spdx: 'CC-BY-SA-4.0',
      attribution: 'Wiktionary contributors, via Kaikki and wiktionary-to-yomitan (wty)',
      sourceUrl: url,
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      redistribution: 'allowed',
      reviewNote: 'Redistribution approved by the project owner; the archive is frozen to the recorded WTY dataset commit and LFS SHA-256.',
    },
    distribution: { state: 'source-only' },
  };
}

export function mergeWtySnapshot({ snapshot, acquisition, catalog, languages, coverage }) {
  validateSnapshot(snapshot);
  const wtySources = snapshot.artifacts.map(artifact => wtyAcquisitionSource(snapshot, artifact));
  const wtyEntries = snapshot.artifacts.map(artifact => wtyCatalogEntry(snapshot, artifact));
  const revision = `${catalog.revision}.wty-${snapshot.datasetCommit.slice(0, 12)}`;
  const nextAcquisition = {
    ...acquisition,
    wtySnapshotRevision: snapshot.datasetCommit,
    sources: [
      ...(acquisition.sources ?? []).filter(source => !source.id.startsWith('wty-')),
      ...wtySources,
    ].sort((left, right) => left.id.localeCompare(right.id)),
  };
  const nextCatalog = {
    ...catalog,
    revision,
    generatedAt: snapshot.generatedAt,
    entries: [
      ...(catalog.entries ?? []).filter(entry => !entry.id.startsWith('wty-')),
      ...wtyEntries,
    ],
  };
  const pairCounts = new Map();
  const missingCounts = new Map();
  for (const artifact of snapshot.artifacts) {
    if (!pairCounts.has(artifact.headwordLanguage)) pairCounts.set(artifact.headwordLanguage, new Set());
    pairCounts.get(artifact.headwordLanguage).add(artifact.definitionLanguage);
  }
  for (const path of snapshot.missingExpectedPaths) {
    const headword = path.split('/')[2];
    missingCounts.set(headword, (missingCounts.get(headword) ?? 0) + 1);
  }
  const nextLanguages = {
    ...languages,
    revision,
    generatedAt: snapshot.generatedAt,
    languages: languages.languages.map(language => ({
      ...language,
      catalogueEvidence: [...new Set([
        ...language.catalogueEvidence,
        `WTY roster snapshot ${snapshot.datasetCommit.slice(0, 12)}`,
      ])],
      readiness: 'blocked',
      blockers: ['dictionary-objects-not-yet-mirrored'],
      dictionaryCoverage: {
        publishedEntries: 0,
        terms: 0,
        pronunciation: 0,
        definitionLanguages: [],
        wtyPairDirectories: pairCounts.get(language.tag)?.size ?? 0,
        upstreamMissingArchives: missingCounts.get(language.tag) ?? 0,
      },
    })),
  };
  const wtyCoverage = {
    id: 'wty-release-roster',
    label: 'WTY roster-to-roster release snapshot',
    kind: 'huggingface-dataset',
    url: `https://huggingface.co/datasets/${snapshot.dataset}/tree/${snapshot.datasetCommit}/latest/dict`,
    surveyedAt: snapshot.generatedAt,
    surveyMethod: `Frozen Hugging Face tree API snapshot: ${snapshot.pairDirectories} pair directories, ${snapshot.archiveCount} ZIP archives, ${snapshot.totalBytes} bytes.`,
    expectedCatalogEntries: snapshot.archiveCount,
    catalogEntryIdPrefix: 'wty-',
  };
  const nextCoverage = {
    ...coverage,
    collections: [
      ...(coverage.collections ?? []).filter(collection => collection.id !== wtyCoverage.id),
      wtyCoverage,
    ],
  };
  return {
    acquisition: nextAcquisition,
    catalog: nextCatalog,
    languages: nextLanguages,
    coverage: nextCoverage,
  };
}

function archiveUrl(snapshot, artifact) {
  return `https://huggingface.co/datasets/${snapshot.dataset}/resolve/${snapshot.datasetCommit}/${artifact.path}`;
}

function validateSnapshot(snapshot) {
  if (snapshot?.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(snapshot.datasetCommit ?? '')) {
    throw new Error('WTY snapshot must carry schemaVersion 1 and a frozen dataset commit.');
  }
  if (snapshot.archiveCount !== snapshot.artifacts?.length || snapshot.archiveCount < 1) {
    throw new Error('WTY snapshot archiveCount does not match its artifact list.');
  }
  const totalBytes = snapshot.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
  if (totalBytes !== snapshot.totalBytes) throw new Error('WTY snapshot totalBytes does not match its artifacts.');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) {
    console.log('Usage: node scripts/dictionaries/sync-wty-release.mjs [--write]');
    return;
  }
  const write = argv.includes('--write');
  const [snapshot, acquisition, catalog, languages, coverage] = await Promise.all([
    readJson(defaultWtySnapshotPath),
    readJson(defaultAcquisitionPath),
    readJson(resolve(defaultManifestRoot, 'catalog.json')),
    readJson(resolve(defaultManifestRoot, 'languages.json')),
    readJson(defaultUpstreamCoveragePath),
  ]);
  const merged = mergeWtySnapshot({ snapshot, acquisition, catalog, languages, coverage });
  console.log(JSON.stringify({
    mode: write ? 'write' : 'dry-run',
    datasetCommit: snapshot.datasetCommit,
    archives: snapshot.archiveCount,
    bytes: snapshot.totalBytes,
    acquisitionSources: merged.acquisition.sources.length,
    catalogEntries: merged.catalog.entries.length,
  }, null, 2));
  if (!write) return;
  await Promise.all([
    writeJson(defaultAcquisitionPath, merged.acquisition),
    writeJson(resolve(defaultManifestRoot, 'catalog.json'), merged.catalog),
    writeJson(resolve(defaultManifestRoot, 'languages.json'), merged.languages),
    writeJson(defaultUpstreamCoveragePath, merged.coverage),
  ]);
  const recommendationDirectory = resolve(defaultManifestRoot, 'recommendations');
  for (const language of merged.languages.languages) {
    const path = resolve(recommendationDirectory, `${language.tag}-ja.json`);
    const recommendation = JSON.parse(await readFile(path, 'utf8'));
    recommendation.catalogRevision = merged.catalog.revision;
    await writeJson(path, recommendation);
  }
  await generateRecommendationMatrix({
    catalog: merged.catalog,
    learnerLanguages: merged.languages.languages.map(language => language.tag),
    japaneseSourceDirectory: recommendationDirectory,
    outputDirectory: recommendationDirectory,
    write: true,
  });
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) await main();
