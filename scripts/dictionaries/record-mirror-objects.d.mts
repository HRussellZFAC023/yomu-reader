export function distinctPublishedObjects(
  catalog: { entries: Array<Record<string, unknown>> },
): Array<{ key: string; sha256: string; bytes: number }>;

export function recordMirrorObjects(options?: {
  baseUrl?: string;
  manifestRoot?: string;
  ledgerPath?: string;
  concurrency?: number;
  write?: boolean;
  fetchImplementation?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
}): Promise<{
  mode: 'write' | 'dry-run';
  baseUrl: string;
  catalogueEntries: number;
  publishedObjects: number;
  verifiedObjects: number;
  ledgerObjects: number;
  ledgerPath: string;
}>;

export function fetchMirrorHead(
  url: string,
  options?: {
    fetchImplementation?: typeof fetch;
    wait?: (milliseconds: number) => Promise<void>;
    attempts?: number;
  },
): Promise<Response>;
