import { ownedDatabaseName } from '../../app/owned-databases';

export function yomitanDatabaseName(): string {
    return ownedDatabaseName('jpdb-popup-reader-yomitan');
}

/**
 * One store's database name, resolved at its first storage use and then fixed.
 *
 * Construction is too early: hosted Study builds its store before an installed
 * userscript/extension storage bridge may be ready, and then waits for that
 * authority before touching dictionaries. Binding at construction named the
 * standalone database and failed every later operation with "owner changed".
 * Once bound the name never follows the owner, so a later owner switch still
 * fails closed through {@link assertYomitanStorageOwner}.
 */
export function yomitanDatabaseNameAtFirstUse(): () => string {
    let bound: string | undefined;
    return () => (bound ??= yomitanDatabaseName());
}

export function assertYomitanStorageOwner(databaseName: string): void {
    if (databaseName !== yomitanDatabaseName()) throw new Error('Dictionary storage owner changed; reload to reconnect.');
}
