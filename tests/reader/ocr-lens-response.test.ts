import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGoogleLensResponse } from '../../src/reader/ocr/response';

const answer = (name: string) => new Uint8Array(readFileSync(`scripts/fixtures/ocr/${name}.lens-crupload.pb`));

describe('Lens answer integrity', () => {
    it('accepts recorded text and a recorded genuine no-text answer', () => {
        expect(parseGoogleLensResponse(answer('commons-sign-photo'), 960, 720)?.lines).toHaveLength(5);
        expect(parseGoogleLensResponse(answer('grey-frame'), 640, 480)).toBeNull();
    });

    it.each([
        ['empty body', []],
        ['truncated length', [0x12, 0xff]],
        ['truncated objects response', [0x12, 0x03, 0x1a, 0x02]],
        ['truncated nested text', [0x12, 0x02, 0x1a, 0x01]],
        ['truncated fixed64', [0x12, 0x01, 0x09]],
        ['truncated fixed32', [0x12, 0x01, 0x0d]],
        ['invalid field zero', [0x00]],
        ['invalid wire type', [0x0f]],
        ['oversized varint', [0x12, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x02]],
        ['missing objects response', [0x18, 0x01]],
        ['objects field with wrong wire type', [0x10, 0x00]],
        ['server error alongside an objects response', [0x0a, 0x02, 0x08, 0x01, 0x12, 0x00]],
    ])('rejects %s instead of returning no text', (_name, bytes) => {
        expect(() => parseGoogleLensResponse(new Uint8Array(bytes), 640, 480)).toThrow();
    });

    it('rejects an HTML error page returned with HTTP 200', () => {
        const html = new TextEncoder().encode('<!doctype html><title>Service unavailable</title>');
        expect(() => parseGoogleLensResponse(html, 640, 480)).toThrow();
    });
});
