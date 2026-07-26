import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnkiConnectClient, YOMU_MODEL_FIELDS } from '../../src/reader/anki/index';
import { testEnSettings } from './helpers/settings-fixture';
import type { ReaderSettings } from '../../src/reader/app/types';

// The exact field list a live "Yomu Japanese" note type carries when it was
// created before audio, pitch and dictionary mining shipped. Yomu keeps
// writing to it, so the audio and pitch it mines have nowhere to land.
const OLDER_YOMU_MODEL_FIELDS = [
    'Expression',
    'Reading',
    'Meaning',
    'Sentence',
    'Url',
    'Frequency',
    'PartOfSpeech',
    'Image',
];
const FIELDS_THE_OLDER_NOTE_TYPE_GAINS = [
    'Audio',
    'JPDB',
    'Status',
    'Pitch',
    'DictionaryDefinitions',
    'Kanji',
    'Source',
];

type MockAnkiConnectRequest = { action: string; params: Record<string, unknown> };

const DEFAULT_SETTINGS = testEnSettings();

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function stubAnkiConnect(resultByAction: Record<string, unknown>): MockAnkiConnectRequest[] {
    const requests: MockAnkiConnectRequest[] = [];
    vi.stubGlobal('GM', {
        xmlHttpRequest: ({ data }: { data: string }) => {
            const request = JSON.parse(data) as MockAnkiConnectRequest;
            requests.push(request);
            return Promise.resolve({ status: 200, response: { result: resultByAction[request.action] ?? null, error: null } });
        },
    });
    return requests;
}

function ankiClient(settings: Partial<ReaderSettings> = {}): AnkiConnectClient {
    return new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ...settings }));
}

function requestActions(requests: MockAnkiConnectRequest[]): string[] {
    return requests.map(request => request.action);
}

describe('Yomu Anki note type update plan', () => {
    it('reports the fields an older Yomu note type is missing', async () => {
        const requests = stubAnkiConnect({
            modelNames: ['よむ Japanese'],
            modelFieldNames: OLDER_YOMU_MODEL_FIELDS,
        });
        const client = ankiClient();

        await expect(client.yomuModelUpdatePlan()).resolves.toEqual({
            modelName: 'よむ Japanese',
            missingFields: FIELDS_THE_OLDER_NOTE_TYPE_GAINS,
        });
        expect(requestActions(requests)).toEqual(['modelNames', 'modelFieldNames']);
        client.destroy();
    });

    it('reports nothing once the note type carries every field', async () => {
        stubAnkiConnect({
            modelNames: ['よむ Japanese'],
            modelFieldNames: YOMU_MODEL_FIELDS,
        });
        const client = ankiClient();

        await expect(client.yomuModelUpdatePlan()).resolves.toBeNull();
        client.destroy();
    });

    it('leaves an adapted third-party note type alone', async () => {
        stubAnkiConnect({
            modelNames: ['Kaishi 1.5k'],
            modelFieldNames: ['Word', 'Kana', 'Definition', 'Example Sentence', 'Word Audio', 'Picture'],
        });
        const client = ankiClient({ ankiModel: 'Kaishi 1.5k' });

        await expect(client.yomuModelUpdatePlan()).resolves.toBeNull();
        client.destroy();
    });

    it('reports nothing when the note type has yet to be created', async () => {
        stubAnkiConnect({ modelNames: ['Kaishi 1.5k'], modelFieldNames: OLDER_YOMU_MODEL_FIELDS });
        const client = ankiClient();

        await expect(client.yomuModelUpdatePlan()).resolves.toBeNull();
        client.destroy();
    });

    // An empty field read is a failed request, not an empty note type. Reading
    // it as "missing all fifteen" would offer a rewrite of a healthy note type.
    it('reports nothing when the field read comes back empty', async () => {
        stubAnkiConnect({ modelNames: ['よむ Japanese'], modelFieldNames: [] });
        const client = ankiClient();

        await expect(client.yomuModelUpdatePlan()).resolves.toBeNull();
        client.destroy();
    });

    it('reports nothing while Anki mining is switched off', async () => {
        const requests = stubAnkiConnect({
            modelNames: ['よむ Japanese'],
            modelFieldNames: OLDER_YOMU_MODEL_FIELDS,
        });
        const client = ankiClient({ ankiEnabled: false });

        await expect(client.yomuModelUpdatePlan()).resolves.toBeNull();
        expect(requests).toEqual([]);
        client.destroy();
    });
});

describe('Yomu Anki note type update', () => {
    it('adds exactly the missing fields and keeps templates and styling', async () => {
        const requests = stubAnkiConnect({
            modelNames: ['よむ Japanese'],
            modelFieldNames: OLDER_YOMU_MODEL_FIELDS,
            modelFieldAdd: null,
        });
        const client = ankiClient();

        await expect(client.addMissingYomuModelFields()).resolves.toEqual(FIELDS_THE_OLDER_NOTE_TYPE_GAINS);
        expect(requests
            .filter(request => request.action === 'modelFieldAdd')
            .map(request => request.params.fieldName)).toEqual(FIELDS_THE_OLDER_NOTE_TYPE_GAINS);
        expect(requests.every(request => request.params.modelName === undefined || request.params.modelName === 'よむ Japanese')).toBe(true);
        expect(requestActions(requests)).not.toContain('updateModelTemplates');
        expect(requestActions(requests)).not.toContain('updateModelStyling');
        client.destroy();
    });

    it('adds nothing to a note type that already matches', async () => {
        const requests = stubAnkiConnect({
            modelNames: ['よむ Japanese'],
            modelFieldNames: YOMU_MODEL_FIELDS,
            modelFieldAdd: null,
        });
        const client = ankiClient();

        await expect(client.addMissingYomuModelFields()).resolves.toEqual([]);
        expect(requestActions(requests)).toEqual(['modelFieldNames']);
        client.destroy();
    });
});
