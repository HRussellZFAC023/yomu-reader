export interface DictionaryCatalogJson {
  entries: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface MirrorObjectLedgerJson {
  schemaVersion: number;
  baseUrl?: string;
  generatedAt?: string;
  objects: Array<{ sha256: string; key: string; bytes: number; status?: number; observedAt?: string }>;
}

export interface UpstreamCoverageJson {
  schemaVersion: number;
  collections: Array<Record<string, unknown>>;
  unsurveyedCollections?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export function assertPublishedObjectsResolvable(
  catalog: DictionaryCatalogJson,
  ledger: MirrorObjectLedgerJson,
): { publishedEntries: number; ledgerObjects: number };

export function assertDictionaryCoverage(options?: {
  manifestRoot?: string;
  publishedManifestRoot?: string;
  ledgerPath?: string;
  coveragePath?: string;
  acquisitionPath?: string;
}): Promise<{
  objects: { publishedEntries: number; ledgerObjects: number };
  staging: { stagedEntries: number; publishedEntries: number };
  coverage: { collections: number; artifacts: number; unsurveyedCollections: number };
  acquirable: { entries: number; sources: number };
  explorable: { unmirroredEntries: number };
}>;
