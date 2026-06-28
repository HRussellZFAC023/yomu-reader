#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');

const blockedPaths = [
    {
        path: path.join(appRoot, 'docs', 'adr'),
        message: 'Architecture decision records are internal engineering context and must not be published under docs/adr.',
        allowEmptyDirectory: true,
    },
    {
        path: path.join(appRoot, 'docs', 'guides', 'read-games-with-yomininja.md'),
        message: 'Do not publish a third-party-first games guide. Ship a Yomu-owned gaming app/page instead.',
        allowEmptyDirectory: false,
    },
    {
        path: path.join(appRoot, 'docs', 'guides', 'read-games-on-steam-deck.md'),
        message: 'Do not publish a Steam Deck gaming guide until it is a Yomu-owned app flow, not competitor-first instructions.',
        allowEmptyDirectory: false,
    },
    {
        path: path.join(appRoot, 'docs', 'compare', 'migaku-alternative.md'),
        message: 'Do not publish competitor comparison pages in first-party public docs.',
        allowEmptyDirectory: false,
    },
    {
        path: path.join(appRoot, 'docs', 'adr', '0004-gaming-distribution-strategy.md'),
        message: 'Gaming distribution strategy is internal and must not be hosted as a public ADR page.',
        allowEmptyDirectory: false,
    },
    {
        path: path.join(appRoot, 'docs', '.vitepress', 'dist', 'adr'),
        message: 'Architecture decision records are internal engineering context and must not be generated under /adr.',
        allowEmptyDirectory: true,
    },
    {
        path: path.join(appRoot, 'docs', '.vitepress', 'dist', 'guides', 'read-games-with-yomininja.html'),
        message: 'Generated public docs must not include a third-party-first games guide.',
        allowEmptyDirectory: false,
    },
    {
        path: path.join(appRoot, 'docs', '.vitepress', 'dist', 'guides', 'read-games-with-yomininja', 'index.html'),
        message: 'Generated public docs must not include a third-party-first games guide.',
        allowEmptyDirectory: false,
    },
    {
        path: path.join(appRoot, 'docs', '.vitepress', 'dist', 'guides', 'read-games-on-steam-deck.html'),
        message: 'Generated public docs must not include a Steam Deck gaming guide until it is a Yomu-owned app flow.',
        allowEmptyDirectory: false,
    },
    {
        path: path.join(appRoot, 'docs', '.vitepress', 'dist', 'guides', 'read-games-on-steam-deck', 'index.html'),
        message: 'Generated public docs must not include a Steam Deck gaming guide until it is a Yomu-owned app flow.',
        allowEmptyDirectory: false,
    },
];

const sourceDocExtensions = new Set(['.html', '.md', '.mts', '.ts']);
const ignoredSourceDirs = [
    path.join(appRoot, 'docs', 'public'),
    path.join(appRoot, 'docs', '.vitepress', 'cache'),
    path.join(appRoot, 'docs', '.vitepress', 'dist'),
];

function isInsidePath(candidate, parent) {
    const relative = path.relative(parent, candidate);
    return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function collectPublicDocsFiles() {
    const files = [
        path.join(appRoot, 'README.md'),
        path.join(appRoot, 'docs', 'public', 'llms.txt'),
    ];
    const docsRoot = path.join(appRoot, 'docs');

    function visit(dir) {
        if (!existsSync(dir)) return;
        if (ignoredSourceDirs.some(ignoredDir => isInsidePath(dir, ignoredDir))) return;

        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const entryPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                visit(entryPath);
                continue;
            }
            if (!entry.isFile() || !sourceDocExtensions.has(path.extname(entry.name))) continue;
            files.push(entryPath);
        }
    }

    visit(docsRoot);
    return files;
}

const publicDocsFiles = collectPublicDocsFiles();

const blockedPublicCopy = [
    {
        pattern: /\/adr(?:\/|\b)|docs\/adr/i,
        message: 'Public docs must not link to internal ADR routes.',
    },
    {
        pattern: /read-games-with-yomininja|read-games-on-steam-deck/i,
        message: 'Public docs must not link to deleted or competitor-first gaming guides.',
    },
    {
        pattern: /migaku-alternative|Migaku/i,
        message: 'Public docs must not advertise competitor comparison pages.',
    },
    {
        pattern: /Yomi\s*Ninja|YomiNinja|Decky|Tango Lens|Tango\b/i,
        message: 'Public docs must not advertise third-party gaming OCR apps in place of a Yomu-owned flow.',
    },
];

const failures = blockedPaths.flatMap(item => {
    if (!existsSync(item.path)) return [];
    if (item.allowEmptyDirectory) {
        const entries = readdirSync(item.path).filter(name => !name.startsWith('.'));
        if (entries.length === 0) return [];
    }
    return [`${item.message}\nFound: ${path.relative(appRoot, item.path)}`];
});

for (const filePath of publicDocsFiles) {
    if (!existsSync(filePath)) continue;
    const text = readFileSync(filePath, 'utf8');
    for (const rule of blockedPublicCopy) {
        if (!rule.pattern.test(text)) continue;
        failures.push(`${rule.message}\nFound in: ${path.relative(appRoot, filePath)}`);
    }
}

if (failures.length) {
    console.error(failures.join('\n\n'));
    process.exitCode = 1;
}
