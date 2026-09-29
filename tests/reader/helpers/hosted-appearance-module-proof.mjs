import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'https://yomureader.com/pdf-reader/' });
const context = createContext({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    location: dom.window.location, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
    CustomEvent: dom.window.CustomEvent, crypto: webcrypto, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval, console,
});
try {
    const module = new SourceTextModule(readFileSync('docs/public/hosted-appearance-settings.js', 'utf8'), { context });
    await module.link(() => { throw new Error('Appearance module must be self-contained'); });
    await module.evaluate();
    if (Object.keys(module.namespace).join(',') !== 'saveHostedAppearance') throw new Error('Unexpected public capability');
    await module.namespace.saveHostedAppearance({ key: 'theme', value: 'dark' });
    await module.namespace.saveHostedAppearance({ key: 'interfaceLanguage', value: 'ja' });
    const settings = JSON.parse(dom.window.localStorage.getItem('jpdb-popup-reader-settings'));
    const ledger = JSON.parse(dom.window.localStorage.getItem('yomu:settings-intent:v2'));
    process.stdout.write(JSON.stringify({ settings, ledger }));
} finally {
    dom.window.close();
}
