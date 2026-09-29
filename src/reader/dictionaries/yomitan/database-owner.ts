import { ownedDatabaseName } from '../../app/owned-databases';

export function yomitanDatabaseName(): string {
    return ownedDatabaseName('jpdb-popup-reader-yomitan');
}

export function assertYomitanStorageOwner(databaseName: string): void {
    if (databaseName !== yomitanDatabaseName()) throw new Error('Dictionary storage owner changed; reload to reconnect.');
}
