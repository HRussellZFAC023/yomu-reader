export interface DictionaryUploadItem {
  bucket: string;
  key: string;
  path: string;
  contentType: string;
  cacheControl: string;
}

export function buildUploadPlan(options?: {
  releaseRoot?: string;
  publishedManifestRoot?: string;
  stagingRoot?: string;
  bucket?: string;
  manifestsOnly?: boolean;
}): Promise<DictionaryUploadItem[]>;

export function buildAcquiredObjectUploadPlan(options?: {
  stagingRoot?: string;
  bucket?: string;
}): Promise<DictionaryUploadItem[]>;

export function remoteObjectMatches(
  baseUrl: string,
  key: string,
  size: number,
  options?: {
    fetchImplementation?: typeof fetch;
    wait?: (milliseconds: number) => Promise<void>;
    attempts?: number;
  },
): Promise<boolean>;

export function uploadDictionaryRelease(
  items: DictionaryUploadItem[],
  options?: {
    execute?: boolean;
    bucket?: string;
    confirmBucket?: string;
    concurrency?: number;
    resumeUrl?: string;
    uploadImplementation?: (item: DictionaryUploadItem) => Promise<void>;
  },
): Promise<{
  mode: 'dry-run' | 'execute';
  uploads: Array<{
    destination: string;
    file: string;
    contentType: string;
    cacheControl: string;
  }>;
  skipped?: number;
}>;
