import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnkiConnectClient, YOMU_MODEL_FIELDS } from '../../src/reader/anki/index';
import { testEnSettings } from './helpers/settings-fixture';
import type { ReaderSettings } from '../../src/reader/app/types';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

// AnkiConnect answers 200 with an error string while a modal holds the
// collection, so the daemon is up and every read fails. Stubbing an Error for
// an action reproduces exactly that.
class AnkiConnectStubError extends Error {}

function stubAnkiConnect(resultByAction: Record<string, unknown>): MockAnkiConnectRequest[] {
    const requests: MockAnkiConnectRequest[] = [];
    vi.stubGlobal('GM', {
        xmlHttpRequest: ({ data }: { data: string }) => {
            const request = JSON.parse(data) as MockAnkiConnectRequest;
            requests.push(request);
            const result = resultByAction[request.action] ?? null;
            return Promise.resolve(result instanceof AnkiConnectStubError
                ? { status: 200, response: { result: null, error: result.message } }
                : { status: 200, response: { result, error: null } });
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

        await expect(client.addMissingYomuModelFields('よむ Japanese')).resolves.toEqual(FIELDS_THE_OLDER_NOTE_TYPE_GAINS);
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

        await expect(client.addMissingYomuModelFields('よむ Japanese')).resolves.toEqual([]);
        expect(requestActions(requests)).not.toContain('modelFieldAdd');
        client.destroy();
    });

    // Fifteen fields is a schema change across the whole collection, and Anki
    // has no cheap undo for it. Every reason the plan has for staying quiet is
    // therefore a reason to write nothing, so the write asks the plan.
    it('adds nothing to a third-party note type the plan declines', async () => {
        const requests = stubAnkiConnect({
            modelNames: ['Basic'],
            modelFieldNames: ['Front', 'Back'],
            modelFieldAdd: null,
        });
        const client = ankiClient({ ankiModel: 'Basic' });

        await expect(client.yomuModelUpdatePlan()).resolves.toBeNull();
        await expect(client.addMissingYomuModelFields('Basic')).resolves.toEqual([]);
        expect(requestActions(requests)).not.toContain('modelFieldAdd');
        client.destroy();
    });

    it('adds nothing when the field read fails', async () => {
        const requests = stubAnkiConnect({
            modelNames: ['よむ Japanese'],
            modelFieldNames: new AnkiConnectStubError('collection is not available'),
            modelFieldAdd: null,
        });
        const client = ankiClient();

        await expect(client.addMissingYomuModelFields('よむ Japanese')).resolves.toEqual([]);
        expect(requestActions(requests)).not.toContain('modelFieldAdd');
        client.destroy();
    });

    it('adds nothing when the note type moved on after the offer was made', async () => {
        const requests = stubAnkiConnect({
            modelNames: ['よむ Japanese'],
            modelFieldNames: OLDER_YOMU_MODEL_FIELDS,
            modelFieldAdd: null,
        });
        const client = ankiClient();

        await expect(client.addMissingYomuModelFields('Kaishi 1.5k')).resolves.toEqual([]);
        expect(requestActions(requests)).not.toContain('modelFieldAdd');
        client.destroy();
    });
});

// The smoke run drives the built companion through a browser, so it cannot
// import this list. Pinning the copy here keeps model-schema.ts the one place
// the field list is decided.
describe('Yomu Anki note type field list', () => {
    it('matches the copy the Anki mining smoke run mocks AnkiConnect with', () => {
        const source = readFileSync(path.join(repoRoot, 'scripts/anki-mining-smoke.mjs'), 'utf8');
        const literal = /const YOMU_MODEL_FIELDS = \[([^\]]*)\]/.exec(source)?.[1];
        expect(literal).toBeTruthy();
        const smokeFields = [...(literal ?? '').matchAll(/'([^']+)'/g)].map(match => match[1]);
        expect(smokeFields).toEqual(YOMU_MODEL_FIELDS);
    });
});
