import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { DatabaseSync as NodeDatabaseSync, SQLInputValue } from 'node:sqlite';
import type {
    D1Database,
    D1PreparedStatement,
    D1Result,
    R2Bucket,
    R2ObjectBody,
    R2Range,
} from '../../../workers/yomu-academy/src/cf';
import type { Env } from '../../../workers/yomu-academy/src/env';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

class SqliteStatement implements D1PreparedStatement {
    private values: unknown[] = [];

    constructor(
        private readonly database: NodeDatabaseSync,
        private readonly query: string,
    ) {}

    bind(...values: unknown[]): D1PreparedStatement {
        this.values = values;
        return this;
    }

    async first<T>(): Promise<T | null> {
        const result = this.execute<T>();
        return result.results[0] ?? null;
    }

    async run<T>(): Promise<D1Result<T>> {
        return this.execute<T>();
    }

    async all<T>(): Promise<D1Result<T>> {
        return this.execute<T>();
    }

    execute<T>(): D1Result<T> {
        const statement = this.database.prepare(this.query);
        const values = this.values.map(sqlValue);
        const rows = statement.columns().length > 0
            ? statement.all(...values)
            : [];
        const changes = statement.columns().length > 0
            ? (/^SELECT\b/iu.test(this.query.trim()) ? 0 : rows.length)
            : Number(statement.run(...values).changes);
        return {
            results: rows as unknown as T[],
            success: true,
            meta: { changes },
        };
    }
}

class SqliteD1 implements D1Database {
    private failNextBatchAfterStatements: number | null = null;

    constructor(readonly database: NodeDatabaseSync) {}

    prepare(query: string): D1PreparedStatement {
        return new SqliteStatement(this.database, query);
    }

    async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
        this.database.exec('BEGIN IMMEDIATE');
        try {
            const results = statements.map((statement, index) => {
                if (!(statement instanceof SqliteStatement)) throw new TypeError('Unexpected D1 statement implementation.');
                const result = statement.execute<T>();
                if (this.failNextBatchAfterStatements === index + 1) {
                    throw new Error(`Injected D1 batch failure after statement ${index + 1}.`);
                }
                return result;
            });
            this.database.exec('COMMIT');
            return results;
        } catch (error) {
            this.database.exec('ROLLBACK');
            throw error;
        } finally {
            this.failNextBatchAfterStatements = null;
        }
    }

    failNextBatchAfter(statementCount: number): void {
        if (!Number.isSafeInteger(statementCount) || statementCount < 1) {
            throw new TypeError('Injected batch failure point must be a positive integer.');
        }
        this.failNextBatchAfterStatements = statementCount;
    }

    rows<T>(query: string, ...values: SQLInputValue[]): T[] {
        return this.database.prepare(query).all(...values) as unknown as T[];
    }

    close(): void {
        this.database.close();
    }
}

class EmptyR2 implements R2Bucket {
    async get(_key: string, _options?: { range?: R2Range }): Promise<R2ObjectBody | null> {
        return null;
    }

    async head(_key: string): Promise<Omit<R2ObjectBody, 'body'> | null> {
        return null;
    }
}

export interface SqliteAcademy {
    readonly env: Env;
    readonly db: SqliteD1;
    close(): void;
}

export function createSqliteAcademy(): SqliteAcademy {
    const database = new DatabaseSync(':memory:');
    const migrationsRoot = resolve(process.cwd(), 'workers/yomu-academy/migrations');
    const migrations = readdirSync(migrationsRoot)
        .filter(file => /^\d{4}_[a-z0-9_]+\.sql$/u.test(file))
        .sort();
    for (const migration of migrations) {
        database.exec(readFileSync(resolve(migrationsRoot, migration), 'utf8'));
    }
    const db = new SqliteD1(database);
    const env: Env = {
        ACADEMY_DB: db,
        ACADEMY_MEDIA: new EmptyR2(),
        ACADEMY_ORIGIN: 'https://yomureader.com',
        ACADEMY_INVITE_HMAC_KEY: 'sqlite-test-invite-hmac-key',
        ACADEMY_RATE_HMAC_KEY: 'sqlite-test-rate-hmac-key',
        ACADEMY_ADMIN_TOKEN: 'sqlite-test-admin-token',
        STRIPE_SECRET_KEY: 'sk_live_sqlite_test',
        STRIPE_WEBHOOK_SECRET: 'whsec_sqlite_test',
        GOOGLE_OIDC_CLIENT_ID: 'sqlite-test.apps.googleusercontent.com',
        GOOGLE_OIDC_CLIENT_SECRET: 'sqlite-google-client-secret',
    };
    return { env, db, close: () => db.close() };
}

function sqlValue(value: unknown): SQLInputValue {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || ArrayBuffer.isView(value)) {
        return value as SQLInputValue;
    }
    throw new TypeError(`Unsupported SQLite binding: ${typeof value}`);
}
