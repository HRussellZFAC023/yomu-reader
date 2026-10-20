export interface RecordedProduct {
    kind: 'userscript';
    label: string;
    root: string;
    scriptPath: string;
    cssPath: string;
    hostedRoot: string;
}
export function worktreeProduct(root?: string): RecordedProduct;
export function releaseProduct(tag: string, options?: { repoRoot?: string }): RecordedProduct;
export function hostedFile(product: Pick<RecordedProduct, 'hostedRoot'>, url: string): string | null;
export function hostedAnswer(file: string, product?: Pick<RecordedProduct, 'hostedRoot'>): { status: number; contentType: string; body: Buffer };
export function preloadHostedRuntimeAssets(product: Pick<RecordedProduct, 'hostedRoot'>): void;
