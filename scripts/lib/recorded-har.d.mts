export interface HarAnswer { status: number; headers: Record<string, string>; body: Buffer; contentType: string }
export function mimeTypeOf(contentType: string | undefined): string;
export function createHarWriter(options?: { creator?: string; unique?: boolean }): {
    add(entry: { method?: string; url: string; status?: number; contentType?: string; body?: string | Buffer; requestBody?: string; headers?: Array<{ name: string; value: string }> }): boolean;
    lookup(method: string, url: string, body?: string | null): HarAnswer | null;
    size(): number;
    write(dir: string, harName: string, resourceDir?: string): number;
};
export function readHarIndex(harPath: string, options?: { preload?: boolean }): {
    entries: unknown[];
    has(method: string, url: string, body?: string | Buffer | null): boolean;
    lookup(method: string, url: string, body?: string | Buffer | null): HarAnswer | null;
};
