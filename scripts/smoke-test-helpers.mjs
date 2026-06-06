import { readFileSync } from 'node:fs';

export async function installUserscriptCssResource(page, cssPath, resourceName = 'yomuCss') {
    const css = readFileSync(cssPath, 'utf8');
    await page.addStyleTag({ content: css });
    await page.evaluate(({ cssText, name }) => {
        window.GM_getResourceText = requested => requested === name ? cssText : '';
    }, { cssText: css, name: resourceName });
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
