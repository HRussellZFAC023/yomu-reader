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

export function uploadDictionaryRelease(
  items: DictionaryUploadItem[],
  options?: {
    execute?: boolean;
    bucket?: string;
    confirmBucket?: string;
    concurrency?: number;
    resumeUrl?: string;
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
