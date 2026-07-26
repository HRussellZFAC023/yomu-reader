import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The Yomu Gaming desktop icons are rendered from the canonical vector and committed,
// because Linux and Windows cannot produce an .icns. That makes them silently
// forgettable: the app icon went a revision stale once already when the vector was
// re-centred and only the browser-extension icons were rebuilt.
const appRoot = path.resolve(__dirname, '../..');
const iconDir = path.join(appRoot, 'public', 'app-icons');
const PNG_NAME = 'yomu-gaming-512.png';
const ICNS_NAME = 'yomu-gaming.icns';

// Every representation macOS asks for, so the Dock and the app switcher never fall
// back to a downscale of the 512 (which is what corrupted the small sizes before).
const REQUIRED_ICNS_TYPES = ['ic04', 'ic05', 'ic07', 'ic08', 'ic09', 'ic10', 'ic11', 'ic12', 'ic13', 'ic14'];

function sourceRevision(): string {
    return createHash('sha256').update(readFileSync(path.join(appRoot, 'public', 'yomu-icon.svg'))).digest('hex');
}

function icnsTypes(file: Buffer): string[] {
    const total = file.readUInt32BE(4);
    const types: string[] = [];
    for (let offset = 8; offset < total;) {
        types.push(file.subarray(offset, offset + 4).toString('latin1'));
        const length = file.readUInt32BE(offset + 4);
        if (length <= 0) break;
        offset += length;
    }
    return types;
}

describe('Yomu Gaming app icon assets', () => {
    it('renders both desktop icons from the current public/yomu-icon.svg', () => {
        const stamp = JSON.parse(readFileSync(path.join(iconDir, 'generated-from.json'), 'utf8'));
        expect(stamp.source).toBe('public/yomu-icon.svg');
        expect(stamp.renderedFrom[PNG_NAME]).toBe(sourceRevision());
        expect(stamp.renderedFrom[ICNS_NAME]).toBe(sourceRevision());
    });

    it('ships a 512 PNG the main process can hand to the Dock', () => {
        const png = readFileSync(path.join(iconDir, PNG_NAME));
        expect(png.subarray(0, 8).toString('latin1')).toBe('\x89PNG\r\n\x1a\n');
        expect(png.readUInt32BE(16)).toBe(512);
        expect(png.readUInt32BE(20)).toBe(512);
    });

    it('ships an icns carrying every macOS representation', () => {
        const icns = readFileSync(path.join(iconDir, ICNS_NAME));
        expect(icns.subarray(0, 4).toString('latin1')).toBe('icns');
        expect(icns.readUInt32BE(4)).toBe(icns.length);
        expect(icnsTypes(icns)).toEqual(expect.arrayContaining(REQUIRED_ICNS_TYPES));
    });

    it('keeps the icon step inside the normal gaming build', () => {
        const scripts = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8')).scripts;
        expect(scripts['build:gaming']).toContain('build:gaming:icon');
    });
});
