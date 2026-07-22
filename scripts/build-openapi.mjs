#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serviceDocuments, validateOpenApiDocuments } from './openapi/yomu-openapi.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(appRoot, 'docs', 'public', 'api');
const packageJson = JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8'));

function yaml(value, depth = 0) {
    const indent = '  '.repeat(depth);
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        return value.map(item => {
            if (item !== null && typeof item === 'object') return `${indent}-\n${yaml(item, depth + 1)}`;
            return `${indent}- ${scalar(item)}`;
        }).join('\n');
    }
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 0) return '{}';
        return entries.map(([key, item]) => {
            const quotedKey = JSON.stringify(key);
            if (item !== null && typeof item === 'object' && Object.keys(item).length > 0) {
                return `${indent}${quotedKey}:\n${yaml(item, depth + 1)}`;
            }
            return `${indent}${quotedKey}: ${item !== null && typeof item === 'object' ? yaml(item, 0) : scalar(item)}`;
        }).join('\n');
    }
    return `${indent}${scalar(value)}`;
}

function scalar(value) {
    if (value === null) return 'null';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
}

const result = validateOpenApiDocuments();
await mkdir(outputDirectory, { recursive: true });
for (const [service, document] of Object.entries(serviceDocuments)) {
    const versioned = {
        ...document,
        info: { ...document.info, version: packageJson.version },
    };
    await writeFile(path.join(outputDirectory, `${service}.openapi.json`), `${JSON.stringify(versioned, null, 2)}\n`);
    await writeFile(path.join(outputDirectory, `${service}.openapi.yaml`), `${yaml(versioned)}\n`);
}

const catalog = {
    schemaVersion: 1,
    generatedFrom: 'scripts/openapi/yomu-openapi.mjs',
    applicationVersion: packageJson.version,
    services: Object.keys(serviceDocuments).map(service => ({
        id: service,
        json: `/api/${service}.openapi.json`,
        yaml: `/api/${service}.openapi.yaml`,
    })),
};
await writeFile(path.join(outputDirectory, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile(path.join(outputDirectory, 'openapi.json'), await readFile(path.join(outputDirectory, 'academy.openapi.json')));
await writeFile(path.join(outputDirectory, 'openapi.yaml'), await readFile(path.join(outputDirectory, 'academy.openapi.yaml')));
console.log(`Built ${result.services} OpenAPI services with ${result.operations} operations.`);
