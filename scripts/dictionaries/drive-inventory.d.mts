export interface DriveInventoryEntry {
  id: string;
  name: string;
  kind: 'folder' | 'file';
  mimeType: string;
  parentId: string;
  relativePath: string;
  sourceUrl: string;
}

export function parsePublicDriveFolderHtml(
  html: string,
  parent?: { id: string; path: string },
): DriveInventoryEntry[];

export function googleDriveFolderId(value: string): string;
export function googleDriveDownloadUrl(fileId: string): string;

