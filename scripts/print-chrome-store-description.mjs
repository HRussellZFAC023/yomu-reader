import { readFileSync } from 'node:fs';

const metadata = JSON.parse(readFileSync(new URL('../config/amo-metadata.json', import.meta.url), 'utf8'));
const source = metadata?.description?.['en-US'];
if (typeof source !== 'string' || !source.trim()) {
    throw new Error('config/amo-metadata.json has no en-US detailed description.');
}

const description = source
    .replace('\n<ul><li>', '\n- ')
    .replaceAll('</li><li>', '\n- ')
    .replace('</li></ul>', '\n');

if (/<\/?[a-z][^>]*>/iu.test(description)) {
    throw new Error('Chrome Web Store description projection left HTML markup behind.');
}

process.stdout.write(`${description.trim()}\n`);
