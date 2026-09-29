import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function compiledDictionaryBackgroundSource(): string {
    const helper = pathToFileURL(resolve('scripts/lib/extension-dictionary-background.mjs')).href;
    return execFileSync(process.execPath, ['--input-type=module', '-e',
        `const { buildExtensionDictionaryBackgroundSource } = await import(${JSON.stringify(helper)});
         process.stdout.write(await buildExtensionDictionaryBackgroundSource(process.cwd()));`,
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}
