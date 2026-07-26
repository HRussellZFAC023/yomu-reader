export interface DriveInventoryEntry {
  id: string;
  name: string;
  kind: 'folder' | 'file';
  mimeType: string;
  parentId: string;
  relativePath: string;
  sourceUrl: string;
}

export const PUBLIC_DRIVE_FOLDER_PAGE_ROW_CAP: number;

export function parsePublicDriveFolderHtml(
  html: string,
  parent?: { id: string; path: string },
): DriveInventoryEntry[];

export function crawlPublicDriveFolder(options: {
  folderUrl: string;
  recurse?: boolean;
  skipFolderNames?: string[];
  includeExtensions?: string[];
  fetchImpl?: (url: string, init?: unknown) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
  pageRowCap?: number;
}): Promise<{
  schemaVersion: number;
  generatedAt: string;
  rootFolderId: string;
  rootFolderUrl: string;
  entries: DriveInventoryEntry[];
  skippedFolders: DriveInventoryEntry[];
}>;

export function googleDriveFolderId(value: string): string;
export function googleDriveDownloadUrl(fileId: string): string;

