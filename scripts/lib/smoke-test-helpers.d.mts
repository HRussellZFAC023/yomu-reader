import type { Page } from 'playwright';

export function installUserscriptCssResource(page: Page, cssPath: string, resourceName?: string): Promise<string>;
export function addScriptTagWithCspFallback(page: Page, scriptPath: string): Promise<void>;
export function addUserscriptGraphInitScripts(page: Page, scriptPath: string): Promise<void>;
export function userscriptCompanionPaths(userscriptPath: string): string[];
