export interface WtyReleaseArtifact {
  id: string;
  path: string;
  filename: string;
  headwordLanguage: string;
  definitionLanguage: string;
  category: string;
  variant: string;
  bytes: number;
  sha256: string;
}

export interface WtyReleaseSnapshot {
  dataset: string;
  datasetCommit: string;
  artifacts: WtyReleaseArtifact[];
  missingExpectedPaths?: string[];
  [key: string]: any;
}

export function wtyAcquisitionSource(
  snapshot: WtyReleaseSnapshot,
  artifact: WtyReleaseArtifact,
): Record<string, any>;

export function wtyCatalogEntry(
  snapshot: WtyReleaseSnapshot,
  artifact: WtyReleaseArtifact,
): Record<string, any>;

export function mergeWtySnapshot(options: {
  snapshot: WtyReleaseSnapshot;
  acquisition: { sources?: Array<Record<string, any>>; collections?: Array<Record<string, any>>; [key: string]: any };
  catalog: { entries?: Array<Record<string, any>>; [key: string]: any };
  languages: { languages?: Array<Record<string, any>>; [key: string]: any };
  coverage: { collections?: Array<Record<string, any>>; [key: string]: any };
}): {
  acquisition: { sources: Array<Record<string, any>>; [key: string]: any };
  catalog: { entries: Array<Record<string, any>>; [key: string]: any };
  languages: { languages: Array<Record<string, any>>; [key: string]: any };
  coverage: { collections: Array<Record<string, any>>; [key: string]: any };
};
