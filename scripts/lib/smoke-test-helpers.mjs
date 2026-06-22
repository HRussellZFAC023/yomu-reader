import { readFileSync } from 'node:fs';

export async function installUserscriptCssResource(page, cssPath, resourceName = 'yomuCss') {
    const css = readFileSync(cssPath, 'utf8');
    await withNavigationRetry(page, async () => {
        await page.addStyleTag({ content: css });
        await page.evaluate(({ cssText, name }) => {
            window.GM_getResourceText = requested => requested === name ? cssText : '';
        }, { cssText: css, name: resourceName });
    });
    return css;
}

export async function addScriptTagWithCspFallback(page, scriptPath) {
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
