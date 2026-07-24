export interface AcquisitionQueueItem {
  sourceId: string;
  collectionId?: string;
  sourceFileId?: string;
  filename: string;
  relativePath: string;
  downloadUrl: string;
  acquisitionKind: 'direct' | 'google-drive';
  redistributionReview: string;
}

export function buildAcquisitionQueue(
  config: unknown,
  inventory?: unknown,
): Promise<AcquisitionQueueItem[]>;

