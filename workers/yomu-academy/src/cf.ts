/**
 * Minimal structural types for the Cloudflare bindings this Worker uses.
 * The repo does not vendor @cloudflare/workers-types, and these modules are
 * imported by vitest/tsc under the DOM lib, so we declare only the surface we
 * call. Wrangler's generated types can replace this file once the repo adopts
 * `wrangler types`.
 */
export interface D1Result<T = Record<string, unknown>> {
    readonly results: T[];
    readonly success: boolean;
    readonly meta: { readonly changes?: number };
}

export interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface R2Range {
    readonly offset: number;
    readonly length: number;
}

export interface R2ObjectBody {
    readonly key: string;
    readonly size: number;
    readonly httpEtag: string;
    readonly body: ReadableStream;
    readonly httpMetadata?: { readonly contentType?: string };
}

export interface R2Bucket {
    get(key: string, options?: { range?: R2Range }): Promise<R2ObjectBody | null>;
    head(key: string): Promise<Omit<R2ObjectBody, 'body'> | null>;
}

export interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
}

export interface ScheduledController {
    readonly scheduledTime: number;
    readonly cron: string;
}
