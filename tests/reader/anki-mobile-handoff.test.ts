import { afterEach, describe, expect, it } from 'vitest';
import { mobileAnkiHandoffTarget, mobileAnkiHandoffAppName } from '../../src/reader/anki/mobile-handoff';
import type { AnkiNote } from '../../src/reader/anki/types';

const IOS_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0';

function useUserAgent(userAgent: string): void {
    Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent, platform: 'iPad', maxTouchPoints: 5 },
        configurable: true,
    });
}

function note(overrides: Partial<AnkiNote> = {}): AnkiNote {
    return {
        deckName: 'Mining',
        modelName: 'よむ Japanese',
        fields: { Expression: '読む', Sentence: '本を読む', Reading: 'よむ', Meaning: 'to read' },
        ...overrides,
    };
}

afterEach(() => {
    Reflect.deleteProperty(globalThis, 'navigator');
});

describe('mobileAnkiHandoffTarget (iOS / AnkiMobile)', () => {
    it('builds an x-callback addnote URL with the note type and deck', () => {
        useUserAgent(IOS_UA);
        const { appName, url } = mobileAnkiHandoffTarget(note());
        expect(appName).toBe('AnkiMobile');
        expect(url.startsWith('anki://x-callback-url/addnote?')).toBe(true);
        expect(url).toContain('type=%E3%82%88%E3%82%80%20Japanese');
        expect(url).toContain('deck=Mining');
    });

    it('encodes spaces as %20 not + so AnkiMobile resolves the note type', () => {
        // Regression: URLSearchParams turned 'よむ Japanese' into 'よむ+Japanese',
        // an unknown note type. Spaces must encode as %20.
        useUserAgent(IOS_UA);
        const { url } = mobileAnkiHandoffTarget(note());
        expect(url).not.toContain('+');
        expect(url).toContain('%20');
    });

    it('remaps the default よむ/yomu deck names to AnkiMobile Default', () => {
        useUserAgent(IOS_UA);
        expect(mobileAnkiHandoffTarget(note({ deckName: 'よむ' })).url).toContain('deck=Default');
        expect(mobileAnkiHandoffTarget(note({ deckName: 'yomu' })).url).toContain('deck=Default');
        expect(mobileAnkiHandoffTarget(note({ deckName: '   ' })).url).toContain('deck=Default');
    });

    it('passes tags space-joined and prefixes note fields with fld', () => {
        useUserAgent(IOS_UA);
        const { url } = mobileAnkiHandoffTarget(note({ tags: ['yomu', 'mined'] }));
        expect(url).toContain('tags=yomu%20mined');
        expect(url).toContain('fldExpression=');
        expect(url).toContain('fldReading=');
    });

    it('drops data: URLs from the Image field but keeps remote ones', () => {
        useUserAgent(IOS_UA);
        const withData = note({ fields: { ...note().fields, Image: 'data:image/png;base64,AAAA' } });
        expect(mobileAnkiHandoffTarget(withData).url).not.toContain('fldImage=');
        const withUrl = note({ fields: { ...note().fields, Image: 'https://cdn.example/pic.png' } });
        expect(mobileAnkiHandoffTarget(withUrl).url).toContain('fldImage=https%3A');
    });

    it('injects a remote media url into the matching field when that field is empty', () => {
        useUserAgent(IOS_UA);
        const withAudio = note({
            audio: [{ filename: 'a.mp3', fields: ['Audio'], url: 'https://cdn.example/a.mp3' }],
        });
        expect(mobileAnkiHandoffTarget(withAudio).url).toContain('fldAudio=https%3A%2F%2Fcdn.example%2Fa.mp3');
    });
});

describe('mobileAnkiHandoffTarget (Android / AnkiDroid)', () => {
    it('builds a SEND intent URL targeting AnkiDroid with a Play Store fallback', () => {
        useUserAgent(ANDROID_UA);
        const { appName, url } = mobileAnkiHandoffTarget(note());
        expect(appName).toBe('AnkiDroid');
        expect(url.startsWith('intent:#Intent')).toBe(true);
        expect(url).toContain('package=com.ichi2.anki');
        expect(url).toContain('action=android.intent.action.SEND');
        expect(url).toContain('S.browser_fallback_url=');
        expect(url).toContain('details%3Fid%3Dcom.ichi2.anki');
    });
});

describe('mobileAnkiHandoffAppName', () => {
    it('names the app by platform', () => {
        useUserAgent(ANDROID_UA);
        expect(mobileAnkiHandoffAppName()).toBe('AnkiDroid');
        useUserAgent(IOS_UA);
        expect(mobileAnkiHandoffAppName()).toBe('AnkiMobile');
    });
});
