import { managedStorageOwner } from './gm-storage-adapters';

const BASES = ['jpdb-popup-reader-yomitan', 'yomu-practice-sessions-v1', 'yomu-anki-status-index'] as const;
type OwnedDatabaseBase = typeof BASES[number];

export function ownedDatabaseName(base: OwnedDatabaseBase): string {
    const owner = managedStorageOwner();
    if (owner === 'standalone' || /^(?:moz|chrome|safari-web)-extension:$/.test(location.protocol)) return base;
    return `${base}-${owner}-v2`;
}

export function databaseBelongsToCurrentOwner(name: string): boolean {
    const base = BASES.find(base => name === base || name === `${base}-userscript-v2` || name === `${base}-extension-v2`);
    if (base) return name === ownedDatabaseName(base);
    return managedStorageOwner() === 'standalone' || /^(?:moz|chrome|safari-web)-extension:$/.test(location.protocol);
}
