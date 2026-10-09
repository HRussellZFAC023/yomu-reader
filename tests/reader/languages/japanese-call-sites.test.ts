import { afterEach, describe, expect, it, vi } from 'vitest';

import { targetOcrLanguageTag } from '../../../src/reader/languages/resolve';
import { createGoogleLensRequest, googleLensAcceptLanguage } from '../../../src/reader/ocr/google-lens-request';
import { ocrRecognizer } from '../../../src/reader/ocr/ocr-providers';
import { readFormSettings } from '../../../src/reader/settings/form-read';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../../src/reader/settings/index';
import type { ReaderSettings } from '../../../src/reader/app/types';

// Japanese is the one learning target: these call sites default to Japanese
// and still honour a language the learner configured explicitly.

afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function readVarint(bytes: Uint8Array, offset: number): [number, number] {
    let value = 0;
    let shift = 0;
    let index = offset;
    while (index < bytes.length) {
        const byte = bytes[index]!;
        index += 1;
        value += (byte & 0x7f) * 2 ** shift;
        shift += 7;
        if (!(byte & 0x80)) break;
    }
    return [value, index];
}

function lengthDelimitedField(message: Uint8Array, field: number): Uint8Array | null {
    let offset = 0;
    while (offset < message.length) {
        const [tag, afterTag] = readVarint(message, offset);
        const wire = tag & 7;
        const number = tag >> 3;
        offset = afterTag;
        if (wire === 2) {
            const [length, afterLength] = readVarint(message, offset);
            if (number === field) return message.subarray(afterLength, afterLength + length);
            offset = afterLength + length;
        } else if (wire === 0) {
            offset = readVarint(message, offset)[1];
        } else {
            return null;
        }
    }
    return null;
}

function nestedMessage(message: Uint8Array, path: readonly number[]): Uint8Array {
    let current = message;
    for (const field of path) {
        const next = lengthDelimitedField(current, field);
        expect(next, `protobuf field ${field}`).not.toBeNull();
        current = next!;
    }
    return current;
}

function lensLocaleContext(request: Uint8Array): { language: string; region: string } {
    // request > 1 > 1 (requestContext) > 4 (clientContext) > 4 (localeContext)
    const localeContext = nestedMessage(request, [1, 1, 4, 4]);
    const decode = (field: number) => new TextDecoder().decode(lengthDelimitedField(localeContext, field) ?? new Uint8Array());
    return { language: decode(1), region: decode(2) };
}

describe('Google Lens OCR request', () => {
    it('keeps the Japanese locale context byte-identical', () => {
        expect(lensLocaleContext(createGoogleLensRequest(new Uint8Array([1, 2, 3]), 40, 20, '')))
            .toEqual({ language: 'ja', region: 'JP' });
        expect(lensLocaleContext(createGoogleLensRequest(new Uint8Array([1, 2, 3]), 40, 20, 'en-GB')))
            .toEqual({ language: 'en', region: 'GB' });
    });

    it('weights the OCR towards Japanese unless a locale is configured', () => {
        expect(googleLensAcceptLanguage('')).toBe('ja,en-US;q=0.9,en;q=0.8');
        expect(googleLensAcceptLanguage('de-DE')).toBe('de,en-US;q=0.9,en;q=0.8');
    });
});

function stubCanvasEncoding(): void {
    const context = {
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData)),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback: BlobCallback) {
        callback(new Blob(['image'], { type: 'image/jpeg' }));
    });
}

function ocrImage(): HTMLImageElement {
    const image = document.createElement('img');
    image.width = 40;
    image.height = 20;
    return image;
}

async function recognizeWith(settings: ReaderSettings): Promise<Record<string, unknown>> {
    const bodies: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ''));
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }));
    const recognizer = ocrRecognizer(settings);
    expect(recognizer).not.toBeNull();
    await recognizer!(ocrImage(), settings);
    expect(bodies).toHaveLength(1);
    return JSON.parse(bodies[0]!) as Record<string, unknown>;
}

describe('OCR provider request payloads', () => {
    it('sends the Japanese OCR language by default', async () => {
        stubCanvasEncoding();
        const body = await recognizeWith({ ...DEFAULT_SETTINGS, ocrProvider: 'local-service', ocrLanguage: '' });

        expect(body.language_code).toBe('ja-JP');
        expect(body.language).toEqual({ bcp47_tag: 'ja-JP', two_letter_code: 'ja' });
    });

    it('still honours an explicitly configured OCR language', async () => {
        stubCanvasEncoding();
        const body = await recognizeWith({ ...DEFAULT_SETTINGS, ocrProvider: 'local-service', ocrLanguage: 'de-DE' });

        expect(body.language_code).toBe('de-DE');
        expect(body.language).toEqual({ bcp47_tag: 'de-DE', two_letter_code: 'de' });
    });
});

describe('stored OCR language', () => {
    it('keeps a blank OCR language blank across a save, so it reads Japanese', () => {
        const saved = readFormSettings(new FormData(), DEFAULT_SETTINGS);
        expect(saved.ocrLanguage).toBe('');
        const reloaded = normalizeReaderSettings(JSON.parse(JSON.stringify(saved)) as ReaderSettings);
        expect(targetOcrLanguageTag(reloaded.ocrLanguage)).toBe('ja-JP');
    });

    it('keeps an explicitly configured OCR language across a save', () => {
        const form = new FormData();
        form.set('ocrLanguage', 'de-DE');
        expect(readFormSettings(form, DEFAULT_SETTINGS).ocrLanguage).toBe('de-DE');
    });

    it('unpins a stored tag an older build wrote as the Japanese default', () => {
        expect(normalizeReaderSettings({ ...DEFAULT_SETTINGS, ocrLanguage: 'ja-JP' }).ocrLanguage).toBe('');
        expect(normalizeReaderSettings({ ...DEFAULT_SETTINGS, ocrLanguage: 'de-DE' }).ocrLanguage).toBe('de-DE');
    });
});
