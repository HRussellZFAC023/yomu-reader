// Serializes a whole IndexedDB database (schema and every record) to JSON so
// a v2 test can rebuild the exact database a release left on disk.
export interface DumpedIndex {
    readonly name: string;
    readonly keyPath: string | string[];
    readonly unique: boolean;
    readonly multiEntry: boolean;
}

export interface DumpedStore {
    readonly name: string;
    readonly keyPath: string | string[] | null;
    readonly autoIncrement: boolean;
    readonly indexes: DumpedIndex[];
    readonly records: Array<{ key: unknown; value: unknown }>;
}

export interface DumpedDatabase {
    readonly name: string;
    readonly version: number;
    readonly stores: DumpedStore[];
}

function request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function openExisting(factory: IDBFactory, name: string): Promise<IDBDatabase> {
    return request(factory.open(name));
}

function jsonSafe(value: unknown): unknown {
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        throw new Error('Binary IndexedDB values need an explicit encoding before they can enter the corpus.');
    }
    return value;
}

async function dumpStore(db: IDBDatabase, name: string): Promise<DumpedStore> {
    const store = db.transaction(name, 'readonly').objectStore(name);
    const indexes = [...store.indexNames].sort().map(indexName => {
        const index = store.index(indexName);
        return { name: index.name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
    });
    const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
    return {
        name,
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement,
        indexes,
        records: keys.map((key, index) => ({ key, value: jsonSafe(values[index]) })),
    };
}

export async function dumpIndexedDb(factory: IDBFactory, name: string): Promise<DumpedDatabase> {
    const db = await openExisting(factory, name);
    try {
        const stores = [];
        for (const storeName of [...db.objectStoreNames].sort()) stores.push(await dumpStore(db, storeName));
        return { name: db.name, version: db.version, stores };
    } finally {
        db.close();
    }
}

/** Records every database a realm opens, in order, without changing behaviour. */
export function recordDatabaseOpens(factory: IDBFactory): string[] {
    const opened: string[] = [];
    const open = factory.open.bind(factory);
    factory.open = ((name: string, version?: number) => {
        if (!opened.includes(name)) opened.push(name);
        return open(name, version);
    }) as IDBFactory['open'];
    return opened;
}
