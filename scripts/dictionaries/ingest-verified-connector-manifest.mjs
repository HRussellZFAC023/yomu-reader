import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  contentAddressedObjectKey,
  defaultManifestRoot,
  parseCommonArguments,
  readJson,
  readJsonIfExists,
  writeJsonAtomic,
} from './lib.mjs';

export function ingestVerifiedConnectorManifest(catalog, connector, ledger = { artifacts: [] }) {
  if (connector?.schemaVersion !== 1) throw new Error('Connector inventory schemaVersion must equal 1.');
  if (connector.snapshotRevision !== catalog.revision) throw new Error('Connector snapshotRevision must match the frozen catalogue.');
  if (connector.expectedEntryCount !== 173 || connector.entries?.length !== 173) {
    throw new Error('Verified connector inventory must contain all 173 frozen dictionary entries.');
  }
  if (connector.redistributionRightsConfirmed !== true) {
    throw new Error('Connector inventory must record the already-confirmed redistribution rights decision.');
  }
  const artifactBySource = new Map((ledger.artifacts ?? []).map(artifact => [artifact.sourceId, artifact]));
  const entriesById = new Map(catalog.entries.map(entry => [entry.id, structuredClone(entry)]));
  const seenConnectorIds = new Set();
  for (const input of connector.entries ?? []) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.catalogId ?? '')) {
      throw new Error(`Invalid connector catalogId: ${input.catalogId}`);
    }
    if (seenConnectorIds.has(input.catalogId)) throw new Error(`Duplicate connector catalogId: ${input.catalogId}`);
    seenConnectorIds.add(input.catalogId);
    const ledgerObject = artifactBySource.get(input.sourceId)?.object;
    if (input.object && ledgerObject && JSON.stringify(input.object) !== JSON.stringify(ledgerObject)) {
      throw new Error(`Connector and acquisition ledger disagree for ${input.sourceId}.`);
    }
    const object = input.object ?? ledgerObject;
    if (object && object.key !== contentAddressedObjectKey(object.sha256)) {
      throw new Error(`Connector object key is not content-addressed for ${input.catalogId}.`);
    }
    entriesById.set(input.catalogId, {
      id: input.catalogId,
      title: requiredText(input.title, `${input.catalogId}.title`),
      format: 'yomitan',
      version: requiredText(input.version, `${input.catalogId}.version`),
      categories: requiredArray(input.categories, `${input.catalogId}.categories`),
      headwordLanguages: requiredArray(input.headwordLanguages, `${input.catalogId}.headwordLanguages`),
      definitionLanguages: requiredArray(input.definitionLanguages, `${input.catalogId}.definitionLanguages`),
      source: {
        acquisitionId: requiredText(input.sourceId, `${input.catalogId}.sourceId`),
        url: httpsUrl(input.sourceUrl, `${input.catalogId}.sourceUrl`),
        ...(input.projectUrl ? { projectUrl: httpsUrl(input.projectUrl, `${input.catalogId}.projectUrl`) } : {}),
        ...(input.catalogueSection ? { catalogueSection: requiredText(input.catalogueSection, `${input.catalogId}.catalogueSection`) } : {}),
      },
      license: {
        spdx: input.licenseSpdx ?? null,
        attribution: requiredText(input.attribution, `${input.catalogId}.attribution`),
        sourceUrl: httpsUrl(input.sourceUrl, `${input.catalogId}.sourceUrl`),
        ...(input.licenseUrl ? { licenseUrl: httpsUrl(input.licenseUrl, `${input.catalogId}.licenseUrl`) } : {}),
        redistribution: 'allowed',
        reviewNote: 'Redistribution rights confirmed for the frozen Slice 1 dictionary collection.',
      },
      distribution: object ? { state: 'published', object } : { state: 'source-only' },
    });
  }
  return {
    ...structuredClone(catalog),
    entries: [...entriesById.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function requiredText(value, path) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty string.`);
  return value;
}

function requiredArray(value, path) {
  if (!Array.isArray(value) || !value.length || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${path} must be a non-empty string array.`);
  }
  return [...new Set(value)];
}

function httpsUrl(value, path) {
  const text = requiredText(value, path);
  if (new URL(text).protocol !== 'https:') throw new Error(`${path} must use HTTPS.`);
  return text;
}

async function main() {
  const args = parseCommonArguments(process.argv.slice(2));
  if (args.help || !args.inventory) {
    console.log('Usage: node scripts/dictionaries/ingest-verified-connector-manifest.mjs --inventory FILE [--staging-dir DIR] [--write --output FILE]');
    console.log('Without --write the connector inventory is validated and a catalogue summary is printed.');
    return;
  }
  const catalog = await readJson(resolve(defaultManifestRoot, 'catalog.json'));
  const connector = await readJson(args.inventory);
  const ledger = await readJsonIfExists(resolve(args.staging, 'acquisition-ledger.v1.json'), { artifacts: [] });
  const ingested = ingestVerifiedConnectorManifest(catalog, connector, ledger);
  const summary = {
    mode: args.write ? 'write' : 'dry-run',
    entries: ingested.entries.length,
    published: ingested.entries.filter(entry => entry.distribution.state === 'published').length,
    sourceOnly: ingested.entries.filter(entry => entry.distribution.state === 'source-only').length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!args.write) return;
  if (!args.output) throw new Error('--write requires --output so the frozen base catalogue is never overwritten accidentally.');
  await writeJsonAtomic(resolve(args.output), ingested);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await main();
}
