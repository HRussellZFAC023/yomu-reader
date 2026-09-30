import { readFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = path.resolve(import.meta.dirname, '../../src/reader/dictionaries/yomitan/database-name.ts');

/** The origin's one dictionary database name, read from the shipped source. */
export function yomitanDatabaseName() {
    const name = readFileSync(SOURCE, 'utf8').match(/^export const YOMITAN_DATABASE_NAME = '([^']+)';/m)?.[1];
    if (!name) throw new Error(`Could not read the Yomitan database name from ${SOURCE}`);
    return name;
}
