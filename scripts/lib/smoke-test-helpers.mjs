import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export async function installUserscriptCssResource(page, cssPath, resourceName = 'yomuCss') {
    const css = readFileSync(cssPath, 'utf8');
    await withNavigationRetry(page, async () => {
        await page.evaluate(
            ({ cssText, name }) => {
                window.GM_getResourceText = requested => (requested === name ? cssText : '');
            },
            { cssText: css, name: resourceName },
        );
        try {
            await page.addStyleTag({ content: css });
        } catch {
            await page.evaluate(cssText => {
                const sheet = new CSSStyleSheet();
                sheet.replaceSync(cssText);
                document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
            }, css);
        }
    });
    return css;
}

export async function addScriptTagWithCspFallback(page, scriptPath) {
    for (const companionPath of userscriptCompanionPaths(scriptPath)) {
        await addSingleScriptTagWithCspFallback(page, companionPath);
    }
    await addSingleScriptTagWithCspFallback(page, scriptPath);
}

export async function addUserscriptGraphInitScripts(page, scriptPath, options = {}) {
    // Playwright does not guarantee ordering between separately registered
    // init scripts. A userscript's @require graph does: companions execute in
    // declaration order before main. Register one concatenated program so
    // WebKit proves the exact same dependency contract deterministically.
    const graph = requiredUserscriptGraphContent(scriptPath, options.content);
    const program = prefixedUserscriptGraph(graph, options.prefixContent);
    await page.addInitScript({ content: taggedUserscriptGraph(program, options.sourceUrl) });
}

function prefixedUserscriptGraph(graph, prefixContent) {
    if (prefixContent === undefined) return graph;
    if (typeof prefixContent !== 'string') throw new Error('Userscript graph prefix content must be a string.');
    return `${prefixContent}\n;\n${graph}`;
}

function userscriptGraphContent(scriptPath) {
    return [...userscriptCompanionPaths(scriptPath), scriptPath].map(graphPath => readFileSync(graphPath, 'utf8')).join('\n;\n');
}

function requiredUserscriptGraphContent(scriptPath, suppliedContent) {
    const graph = suppliedContent ?? userscriptGraphContent(scriptPath);
    if (typeof graph !== 'string') throw new Error('Userscript graph content must be a string.');
    return graph;
}

function taggedUserscriptGraph(graph, sourceUrl) {
    if (!sourceUrl) return graph;
    if (/[\r\n]/u.test(sourceUrl)) throw new Error('Userscript graph source URL cannot contain a newline.');
    return `${graph}\n//# sourceURL=${sourceUrl}`;
}

// The ONE place that answers "what does a userscript manager execute before the
// core script". Read it from the built @require header rather than listing
// companion bundles by hand: every capability core delegates to a companion slot
// (learning targets, the JPDB/Jiten clients, i18n copy) silently disappears from
// a hand-written list the moment the split moves, and the smoke then measures a
// configuration no reader ever runs.
export function userscriptCompanionPaths(userscriptPath) {
    const root = path.resolve(path.dirname(userscriptPath), '..');
    return readFileSync(userscriptPath, 'utf8')
        .split(/\r?\n/u)
        .flatMap(line => {
            const match = line.match(/^\/\/ @require https:\/\/yomureader\.com\/greasyfork\/([^#\s]+)(?:#\S+)?$/u);
            if (!match) return [];
            const fileName = path.basename(match[1]);
            if (fileName !== match[1]) throw new Error(`Unsafe userscript companion path: ${match[1]}`);
            const hostedPath = path.join(root, 'docs/public/greasyfork', fileName);
            if (existsSync(hostedPath)) return [hostedPath];

            // @require names are content-addressed. A freshly built worktree has
            // the local companions but not yet the hashed hosted copies, so run
            // the companion that MATCHES this core rather than a stale hash.
            const canonicalName = fileName.replace(/\.[a-f0-9]{12}(?=\.user\.js$)/u, '');
            return [path.join(path.dirname(userscriptPath), 'greasyfork', canonicalName)];
        });
}

async function addSingleScriptTagWithCspFallback(page, scriptPath) {
    try {
        await page.addScriptTag({ path: scriptPath });
    } catch (error) {
        await evaluateScriptWithCspBypass(page, scriptPath);
    }
}

async function evaluateScriptWithCspBypass(page, scriptPath) {
    const client = await page.context().newCDPSession(page);
    await client.send('Runtime.evaluate', {
        expression: readFileSync(scriptPath, 'utf8'),
        awaitPromise: false,
        allowUnsafeEvalBlockedByCSP: true,
        replMode: true,
    });
}

async function withNavigationRetry(page, operation) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (!isNavigationRace(error) || attempt === 2) break;
            await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
            await page.waitForTimeout(250).catch(() => undefined);
        }
    }
    throw lastError;
}

function isNavigationRace(error) {
    const message = String(error?.message ?? error);
    return /Execution context was destroyed|Cannot find context with specified id|Target closed|navigation/i.test(message);
}
