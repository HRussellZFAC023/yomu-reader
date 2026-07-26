import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertSafeWorkingDirectory,
  defaultManifestRoot,
  defaultReleaseRoot,
  defaultStagingRoot,
  parseCommonArguments,
  readJson,
  repositoryRoot,
  writeJsonAtomic,
} from './lib.mjs';
import { ingestVerifiedConnectorManifest } from './ingest-verified-connector-manifest.mjs';

export const defaultRecommendationShelfPath = resolve(repositoryRoot, 'config/dictionaries/recommendation-shelf.v1.json');

// Slice 1 seeded three bilingual starter roles because that was all the frozen
// acquisition list held. The published shelf is wider — monolingual, grammar,
// frequency, pitch, examples — and those extra rows are a GENERATED artefact of
// the frozen policy, not hand-written JSON. Copying the pre-release manifests
// through unchanged would regenerate config/dictionaries/published/v1/ back
// down to the three starter rows, silently un-shipping the shelf.
const STARTER_ROLES = new Set(['primary-terms', 'fallback-terms', 'names', 'kanji']);
const SHELF_ROLES = new Set(['monolingual', 'grammar', 'frequency', 'pronunciation', 'examples']);

export function parseRecommendationShelf(policy) {
  if (policy?.schemaVersion !== 1) throw new Error('Recommendation shelf schemaVersion must equal 1.');
  if (policy.targetLanguage !== 'ja') throw new Error('Recommendation shelf targetLanguage must equal ja.');
  if (!Array.isArray(policy.slots) || !policy.slots.length) {
    throw new Error('Recommendation shelf must declare at least one slot.');
  }
  const slots = policy.slots.map((slot, index) => {
    const label = `Recommendation shelf slot ${index}`;
    if (!SHELF_ROLES.has(slot?.role)) throw new Error(`${label} must name a shelf role outside the bilingual starter.`);
    if (typeof slot.dictionaryId !== 'string' || !slot.dictionaryId) throw new Error(`${label} must name a catalogue dictionary.`);
    if (!Number.isSafeInteger(slot.priority) || slot.priority <= 30) throw new Error(`${label} must sort after the starter roles (priority > 30).`);
    if (typeof slot.selectedByDefault !== 'boolean' || typeof slot.offerTranslation !== 'boolean') {
      throw new Error(`${label} must declare selectedByDefault and offerTranslation.`);
    }
    return {
      role: slot.role,
      priority: slot.priority,
      dictionaryId: slot.dictionaryId,
      selectedByDefault: slot.selectedByDefault,
      offerTranslation: slot.offerTranslation,
    };
  });
  if (new Set(slots.map(slot => slot.role)).size !== slots.length) throw new Error('Recommendation shelf roles must be unique.');
  for (let index = 1; index < slots.length; index += 1) {
    if (slots[index - 1].priority >= slots[index].priority) {
      throw new Error('Recommendation shelf slots must be ordered by ascending priority.');
    }
  }
  return slots;
}

/**
 * Returns the manifest with every shelf slot the catalogue can actually serve
 * appended. A slot whose dictionary is missing or not yet mirrored is skipped,
 * so a pre-release catalogue (13 source-only entries) still yields the plain
 * three-row starter and only a published catalogue grows the shelf. Rebuilding
 * from the starter rows keeps a second run idempotent.
 */
export function applyRecommendationShelf(recommendation, catalog, slots) {
  const entryById = new Map(catalog.entries.map(entry => [entry.id, entry]));
  const starter = recommendation.dictionaries.filter(item => STARTER_ROLES.has(item.role));
  const translatable = learnerLanguageAcceptsTranslation(recommendation.learnerLanguage, starter);
  const seeded = new Set(starter.map(item => item.dictionaryId));
  const added = [];
  for (const slot of slots) {
    if (seeded.has(slot.dictionaryId)) continue;
    const entry = entryById.get(slot.dictionaryId);
    if (!entry || entry.distribution?.state !== 'published') continue;
    if (!entry.headwordLanguages?.includes(catalog.targetLanguage)) continue;
    seeded.add(slot.dictionaryId);
    const definitionLanguage = entry.definitionLanguages?.[0] ?? catalog.targetLanguage;
    added.push({
      dictionaryId: slot.dictionaryId,
      role: slot.role,
      priority: slot.priority,
      selectedByDefault: slot.selectedByDefault,
      definitionLanguage,
      translationMode: shelfTranslationMode(recommendation.learnerLanguage, definitionLanguage, slot, translatable),
    });
  }
  return {
    ...recommendation,
    dictionaries: [...starter, ...added].sort((left, right) => left.priority - right.priority),
  };
}

// A frequency or pitch list has no prose to translate, and a definition already
// written in the learner's language must not be re-translated.
function shelfTranslationMode(learnerLanguage, definitionLanguage, slot, translatable) {
  if (!slot.offerTranslation) return 'off';
  if (definitionLanguage === learnerLanguage) return 'off';
  return translatable ? 'offer' : 'off';
}

// Whether a learner language can be machine-translated into at all is already
// recorded in its own starter rows: every starter entry written in some other
// language carries translationMode "offer" — except Ancient Greek, which no
// provider reaches and whose starter is therefore all "off". Reading that
// answer back out of the manifest keeps one source of truth instead of a second
// copy of the translation adapter's capability table living in a build script.
// A starter written entirely in the learner's own language (English) leaves no
// evidence and needs none: it has native dictionaries and a provider.
function learnerLanguageAcceptsTranslation(learnerLanguage, starter) {
  const foreign = starter.filter(item => item.definitionLanguage !== learnerLanguage);
  return !foreign.length || foreign.some(item => item.translationMode === 'offer');
}

export async function prepareDictionaryRelease({
  manifestRoot = defaultManifestRoot,
  stagingRoot = defaultStagingRoot,
  releaseRoot = defaultReleaseRoot,
  shelfPath = defaultRecommendationShelfPath,
  connectorInventory = null,
  write = false,
} = {}) {
  const safeReleaseRoot = assertSafeWorkingDirectory(releaseRoot, 'dictionary release directory');
  const baseCatalog = structuredClone(await readJson(resolve(manifestRoot, 'catalog.json')));
  const languages = await readJson(resolve(manifestRoot, 'languages.json'));
  const ledger = await readJson(resolve(stagingRoot, 'acquisition-ledger.v1.json'));
  const catalog = connectorInventory
    ? ingestVerifiedConnectorManifest(baseCatalog, connectorInventory, ledger)
    : baseCatalog;
  const artifactBySource = new Map(ledger.artifacts.map(artifact => [artifact.sourceId, artifact]));
  let promoted = 0;
  for (const entry of catalog.entries) {
    const artifact = artifactBySource.get(entry.source.acquisitionId);
    if (!artifact || entry.license.redistribution !== 'allowed' || artifact.redistributionReview !== 'allowed') continue;
    entry.distribution = { state: 'published', object: artifact.object };
    promoted += 1;
  }
  const recommendations = [];
  const recommendationFiles = (await readdir(resolve(manifestRoot, 'recommendations')))
    .filter(name => name.endsWith('-ja.json'))
    .sort();
  const shelfSlots = parseRecommendationShelf(await readJson(shelfPath));
  const publishedIds = new Set(
    catalog.entries.filter(entry => entry.distribution.state === 'published').map(entry => entry.id),
  );
  let shelfRows = 0;
  for (const filename of recommendationFiles) {
    const source = structuredClone(await readJson(resolve(manifestRoot, 'recommendations', filename)));
    const recommendation = applyRecommendationShelf(source, catalog, shelfSlots);
    shelfRows += recommendation.dictionaries.filter(item => SHELF_ROLES.has(item.role)).length;
    const dictionariesPublished = recommendation.dictionaries.every(item => publishedIds.has(item.dictionaryId));
    if (dictionariesPublished) {
      recommendation.blockers = recommendation.blockers.filter(blocker => blocker !== 'dictionary-objects-not-yet-mirrored');
      recommendation.readiness = recommendation.blockers.length ? 'blocked' : 'ready';
    }
    recommendations.push({ filename, manifest: recommendation });
  }
  const summary = {
    mode: write ? 'write' : 'dry-run',
    releaseRoot: safeReleaseRoot,
    catalogEntries: catalog.entries.length,
    promotedObjects: promoted,
    shelfRecommendationRows: shelfRows,
    readyLanguages: recommendations.filter(item => item.manifest.readiness === 'ready').length,
    blockedLanguages: recommendations.filter(item => item.manifest.readiness === 'blocked').length,
  };
  if (!write) return summary;
  await writeJsonAtomic(resolve(safeReleaseRoot, 'v1/catalog.json'), catalog);
  await writeJsonAtomic(resolve(safeReleaseRoot, 'v1/languages.json'), languages);
  for (const recommendation of recommendations) {
    await writeJsonAtomic(
      resolve(safeReleaseRoot, 'v1/recommendations', recommendation.filename),
      recommendation.manifest,
    );
  }
  return summary;
}

async function main() {
  const args = parseCommonArguments(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/dictionaries/prepare-release.mjs [--inventory VERIFIED_CONNECTOR_FILE] [--staging-dir DIR] [--release-dir DIR] [--write]');
    console.log('Without --write the command reports which licence-approved, hash-verified objects would be promoted.');
    return;
  }
  const summary = await prepareDictionaryRelease({
    stagingRoot: args.staging,
    releaseRoot: args.release,
    connectorInventory: args.inventory ? await readJson(args.inventory) : null,
    write: args.write,
  });
  console.log(JSON.stringify(summary, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await main();
}
