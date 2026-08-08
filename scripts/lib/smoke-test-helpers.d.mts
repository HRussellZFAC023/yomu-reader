import type { BrowserContext, Page } from 'playwright';

export function installUserscriptCssResource(page: Page, cssPath: string, resourceName?: string): Promise<string>;
export function addScriptTagWithCspFallback(page: Page, scriptPath: string): Promise<void>;
export function addUserscriptGraphInitScripts(
    page: BrowserContext | Page,
    scriptPath: string,
    options?: { sourceUrl?: string; content?: string },
): Promise<void>;
export function userscriptCompanionPaths(userscriptPath: string): string[];
