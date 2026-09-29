/** Install data only. Selection and licensing remain owned by the catalogue. */
export interface OfflineStarterDictionary {
    readonly name: string;
    readonly downloadUrl: string;
    readonly installedIdentity: string;
    readonly integrity?: { readonly sha256: string; readonly bytes: number };
}

/** Shared mirror URLs and identities are derived instead of stored twice. */
export interface OfflineStarterArchive {
    readonly name: string;
    readonly installedIdentity?: string;
    readonly downloadUrl?: string;
    readonly integrity?: OfflineStarterDictionary['integrity'];
}
