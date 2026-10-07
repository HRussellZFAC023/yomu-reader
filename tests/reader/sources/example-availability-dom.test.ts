import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ImmersionKitExample } from '../../../src/reader/immersion/kit';
import type { ReaderSettings } from '../../../src/reader/app/types';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../../src/reader/settings';
import { renderExampleSourceRow } from '../../../src/reader/sources/examples/availability-render';
import { installTargetExampleSources, renderTargetExampleSourceMounts } from '../../../src/reader/sources/examples/mount';
import { createTatoebaExampleSource, tatoebaCapabilitiesFor } from '../../../src/reader/sources/examples/tatoeba';
import { createImmersionKitExampleSource, immersionKitCapabilitiesFor } from '../../../src/reader/sources/examples/immersion-kit';
import { renderDefinitionSourceImmersionMount } from '../../../src/reader/sources/definition-stack';
import { renderProviderExamples, type ProviderExampleView } from '../../../src/reader/sources/provider-examples';
import type { ExampleCollection, ExampleRecord } from '../../../src/reader/sources/examples/types';
import { TATOEBA_SPANISH_PAYLOAD, TATOEBA_THAI_PAYLOAD } from './tatoeba-fixtures';

const sourceAttributes = (key: string, open?: boolean) => `data-source-state-key="${key}"${open ? ' open' : ''}`;

function row(collection: ExampleCollection<ExampleRecord>, targetLanguage = 'es', capabilities = tatoebaCapabilitiesFor(targetLanguage)): HTMLElement {
    document.body.innerHTML = renderExampleSourceRow({
        sourceId: 'tatoeba',
        sourceName: 'Tatoeba',
        interfaceLanguage: 'en',
        targetLanguage,
        outputLanguage: 'en',
        capabilities,
        collection,
        sourceAttributes,
    });
    return document.body.querySelector<HTMLElement>('[data-example-source]')!;
}

function reasons(element: HTMLElement): string[] {
    return Array.from(element.querySelectorAll<HTMLElement>('[data-example-reason]'))
        .map(node => node.dataset.exampleReason ?? '');
}

async function loadedSpanishRow(payload: unknown, targetLanguage = 'es'): Promise<HTMLElement> {
    const source = createTatoebaExampleSource({ fetchJson: async () => payload });
    const collection = await source.search({
        term: 'agua',
        targetLanguage,
        outputLanguage: 'en',
        signal: new AbortController().signal,
    });
    return row(collection, targetLanguage);
}

describe('U46 the four degradation states each render visibly and distinctly', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('1. source not available for this target', () => {
        const element = row({ availability: 'unsupported', items: [] }, 'es', immersionKitCapabilitiesFor('es'));
        expect(element.dataset.availability).toBe('unsupported');
        expect(element.dataset.exampleComponents).toBe('');
        expect(reasons(element)).toEqual(['unsupported-target']);
        expect(element.textContent).toContain('This source has no Spanish sentences.');
        expect(element.querySelector('[data-example-status]')?.textContent).toBe('Other languages');
    });

    it('2. no examples for this term, with the limited-corpus badge where it applies', () => {
        const spanish = row({ availability: 'empty', items: [] }, 'es');
        expect(spanish.dataset.availability).toBe('empty');
        expect(reasons(spanish)).toEqual(['no-results']);
        expect(spanish.textContent).toContain('No examples for this word yet.');
        // Never a zero count: that reads as a defect rather than an answer.
        expect(spanish.querySelector('[data-example-status]')?.textContent).toBe('None yet');

        const lao = row({ availability: 'empty', items: [] }, 'lo');
        expect(reasons(lao)).toEqual(['no-results', 'limited-corpus']);
        expect(lao.textContent).toContain('This corpus is small');
    });

    it('3. examples found but no licensed audio, and no illustration for any target', async () => {
        // The Spanish fixture's only recording is CC BY-NC-ND, so the sentences
        // arrive and the audio does not.
        const element = await loadedSpanishRow(TATOEBA_SPANISH_PAYLOAD);
        expect(element.dataset.availability).toBe('loaded');
        expect(element.querySelectorAll('.jpdb-reader-jpdb-example')).toHaveLength(2);
        expect(element.querySelector('[data-action="play-example-audio"]')).toBeNull();
        expect(reasons(element)).toContain('no-licensed-audio');
        expect(reasons(element)).toContain('no-image-source');
        expect(element.textContent).toContain('These sentences came without openly licensed audio.');
        expect(element.textContent).toContain('Scene images are Japanese only for now.');
    });

    it('4. network, auth and schema failures each say so and offer a retry', () => {
        (['network', 'auth', 'schema'] as const).forEach(reason => {
            const element = row({ availability: 'unavailable', items: [], reason });
            expect(element.dataset.availability).toBe('unavailable');
            expect(reasons(element)).toEqual([reason]);
            expect(element.textContent).toContain('Examples did not load.');
            expect(element.querySelector('[data-action="retry-example-source"]')?.textContent).toBe('Try again');
            expect(element.querySelector('[data-example-status]')?.textContent).toBe('Not loaded');
        });
    });

    it('distinguishes a language with no audio source from one whose audio was refused', () => {
        const korean = row({ availability: 'loaded', items: [record()] }, 'ko');
        expect(reasons(korean)).toContain('no-sentence-audio-source');
        expect(korean.textContent).toContain('Open Korean sentence audio is not available yet.');

        const spanish = row({ availability: 'loaded', items: [record()] }, 'es');
        expect(reasons(spanish)).toContain('no-licensed-audio');
    });

    it('plays and credits an openly licensed recording, and marks audio as per-item', async () => {
        const element = await loadedSpanishRow(TATOEBA_THAI_PAYLOAD, 'th');
        const button = element.querySelector<HTMLElement>('[data-action="play-example-audio"]');
        expect(button?.dataset.exampleAudioUrl).toBe('https://tatoeba.org/audio/download/987383');
        expect(element.dataset.exampleComponents).toBe('text,audio');
        expect(reasons(element)).not.toContain('no-licensed-audio');
        expect(element.textContent).toContain('Audio plays where the recording is openly licensed.');
        expect(element.querySelector('[data-example-audio-licence]')?.textContent).toBe('TonySpeaks (Tatoeba) · CC BY 4.0');
    });

    it('carries source, licence and provenance onto every rendered sentence', async () => {
        const element = await loadedSpanishRow(TATOEBA_SPANISH_PAYLOAD);
        const [first, second] = Array.from(element.querySelectorAll<HTMLElement>('.jpdb-reader-jpdb-example'));
        expect(first?.querySelector('[data-example-licence]')?.textContent).toBe('CC BY 2.0 FR');
        expect(first?.querySelector<HTMLAnchorElement>('[data-example-provenance] a')?.href)
            .toBe('https://tatoeba.org/en/sentences/show/13227432');
        // The sentence and its translation are different languages and say so.
        expect(first?.querySelector<HTMLElement>('[data-provider-example-sentence]')?.lang).toBe('spa');
        expect(first?.querySelector<HTMLElement>('[data-provider-example-translation]')?.lang).toBe('eng');
        expect(second?.querySelector('[data-example-translation-mark]')?.textContent)
            .toBe('Translated via another language');
    });

    it('says which OUTPUT language a translation is missing in', () => {
        const element = row({ availability: 'loaded', items: [{ ...record(), translation: undefined }] }, 'es');
        expect(reasons(element)).toContain('no-human-translation');
        expect(element.textContent).toContain('No English translation yet.');
    });

    it('renders every reason in the INTERFACE language without falling back to English', () => {
        document.body.innerHTML = renderExampleSourceRow({
            sourceId: 'tatoeba',
            sourceName: 'Tatoeba',
            interfaceLanguage: 'ja',
            targetLanguage: 'ko',
            outputLanguage: 'en',
            capabilities: tatoebaCapabilitiesFor('ko'),
            collection: { availability: 'empty', items: [] },
            sourceAttributes,
        });
        const element = document.body.querySelector<HTMLElement>('[data-example-source]')!;
        expect(element.textContent).toContain('この語の例文はまだありません。');
        expect(element.textContent).not.toContain('未翻訳');
    });
});

describe('U46 reverses the silent hiding in the shared provider renderer', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders an empty Bunpro collection instead of nothing', () => {
        document.body.innerHTML = renderProviderExamples('bunpro', 'bunpro', { availability: 'empty', items: [] }, sourceAttributes, 'en');
        const details = document.body.querySelector<HTMLElement>('details')!;
        expect(details.dataset.examplesAvailability).toBe('empty');
        expect(details.querySelector('[data-example-reason="no-results"]')?.textContent)
            .toBe('No examples for this word yet.');
    });

    it('renders a failed collection with its own reason', () => {
        document.body.innerHTML = renderProviderExamples('bunpro', 'bunpro', { availability: 'unavailable', items: [], reason: 'auth' }, sourceAttributes, 'en');
        const details = document.body.querySelector<HTMLElement>('details')!;
        expect(details.dataset.examplesAvailability).toBe('unavailable');
        expect(details.querySelector('[data-example-reason="auth"]')).not.toBeNull();
        expect(details.querySelector('.jpdb-reader-jpdb-examples')).toBeNull();
    });

    it('renders a loaded Japanese collection without a count', () => {
        const example: ProviderExampleView = {
            id: 'example-1',
            sentence: '毎日復習する。',
            sentenceHtml: '毎日復習する。',
            translation: 'I review every day.',
        };
        document.body.innerHTML = renderProviderExamples('jiten', 'jiten', { availability: 'loaded', items: [example] }, sourceAttributes, 'en');
        const details = document.body.querySelector<HTMLElement>('details')!;
        expect(details.dataset.examplesAvailability).toBe('loaded');
        // The sentences speak for themselves: no count beside the header.
        expect(details.querySelector('.jpdb-reader-example-count')).toBeNull();
        expect(details.querySelectorAll('.jpdb-reader-jpdb-example')).toHaveLength(1);
        expect(details.querySelector('[data-example-reason]')).toBeNull();
    });
});

describe('U46 target example mounts in the definition stack', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('keeps the Japanese ImmersionKit mount untouched', () => {
        const html = renderDefinitionSourceImmersionMount(japaneseTarget(), sourceAttributes);
        expect(html).toContain('data-immersion-kit');
        expect(html).not.toContain('data-example-source');
    });

    it('ignores a legacy Spanish profile and keeps the Japanese mount', () => {
        document.body.innerHTML = renderDefinitionSourceImmersionMount(spanishTarget(), sourceAttributes);
        expect(document.body.querySelector('[data-immersion-kit]')).not.toBeNull();
        expect(document.body.querySelector('[data-example-source]')).toBeNull();
        expect(document.body.textContent).not.toContain('Spanish');
    });

    it('respects the disabled Japanese source even with a legacy Spanish profile', () => {
        expect(renderDefinitionSourceImmersionMount(
            { ...spanishTarget(), immersionKitEnabled: false }, sourceAttributes,
        )).toBe('');
    });

    it('still renders nothing for Japanese when the learner turns ImmersionKit off', () => {
        const html = renderDefinitionSourceImmersionMount(
            { ...japaneseTarget(), immersionKitEnabled: false },
            sourceAttributes,
        );
        expect(html).toBe('');
    });

    it('fills the pending card, and a retry re-runs only that source', async () => {
        document.body.innerHTML = renderTargetExampleSourceMounts(japaneseTarget(), sourceAttributes);
        const root = document.body;
        const fetchJson = vi.fn()
            .mockRejectedValueOnce(new Error('network down'))
            .mockResolvedValueOnce(JAPANESE_EXAMPLES);
        const adapter = createImmersionKitExampleSource((term, signal) => fetchJson(term, signal));

        installTargetExampleSources(root, {
            settings: japaneseTarget(),
            term: '水',
            sourceAttributes,
            adapters: [adapter],
        });
        await vi.waitFor(() => expect(root.querySelector('[data-example-source="immersion-kit"]')?.getAttribute('data-availability')).toBe('unavailable'));
        expect(fetchJson).toHaveBeenCalledTimes(1);

        root.querySelector<HTMLElement>('[data-action="retry-example-source"]')!.click();
        await vi.waitFor(() => expect(root.querySelector('[data-example-source="immersion-kit"]')?.getAttribute('data-availability')).toBe('loaded'));
        expect(fetchJson).toHaveBeenCalledTimes(2);
        expect(root.querySelectorAll('.jpdb-reader-jpdb-example')).toHaveLength(2);
        // The independently rendered unsupported source stays untouched.
        expect(root.querySelector('[data-example-source="tatoeba"]')?.getAttribute('data-availability')).toBe('unsupported');
        expect(fetchJson.mock.calls[0]?.[0]).toBe('水');
    });

    it('retries one source without aborting a sibling still in flight', async () => {
        // A single per-root controller made a retry cancel every other source on
        // the popover, which left the sibling card stuck on its loading copy.
        let releaseSlow: (value: ImmersionKitExample[]) => void = () => undefined;
        const slow = createImmersionKitExampleSource(() => new Promise(resolve => {
            releaseSlow = resolve;
        }));
        const failing = createImmersionKitExampleSource(async () => { throw new Error('network down'); });
        const adapters = [
            { ...slow, id: 'slow-source', name: 'Slow' },
            { ...failing, id: 'failing-source', name: 'Failing' },
        ];
        document.body.innerHTML = adapters
            .map(adapter => `<details data-example-source="${adapter.id}" data-availability="pending"></details>`)
            .join('');

        installTargetExampleSources(document.body, { settings: japaneseTarget(), term: '水', sourceAttributes, adapters });
        await vi.waitFor(() => expect(document.body.querySelector('[data-example-source="failing-source"]')?.getAttribute('data-availability')).toBe('unavailable'));

        document.body.querySelector<HTMLElement>('[data-action="retry-example-source"]')!.click();
        releaseSlow(JAPANESE_EXAMPLES);
        await vi.waitFor(() => expect(document.body.querySelector('[data-example-source="slow-source"]')?.getAttribute('data-availability')).toBe('loaded'));
    });

    it('renders an empty result rather than leaving the loading copy in place', async () => {
        document.body.innerHTML = renderTargetExampleSourceMounts(japaneseTarget(), sourceAttributes);
        installTargetExampleSources(document.body, {
            settings: japaneseTarget(),
            term: 'zzqqx',
            sourceAttributes,
            adapters: [createImmersionKitExampleSource(async () => [])],
        });
        await vi.waitFor(() => expect(document.body.querySelector('[data-example-source="immersion-kit"]')?.getAttribute('data-availability')).toBe('empty'));
        expect(document.body.textContent).not.toContain('Loading');
    });

    it('sanitizes the loaded replacement before it enters the live document', async () => {
        document.body.innerHTML = '<details data-example-source="immersion-kit" data-availability="pending"></details>';
        const baseAdapter = createImmersionKitExampleSource(async () => []);
        const adapter = {
            ...baseAdapter,
            search: async () => ({
                availability: 'loaded' as const,
                items: [{
                    ...record(),
                    text: { value: '<img src=x onerror="window.__yomuUnsafe = true">', language: 'ja' },
                    source: { ...record().source, url: 'javascript:alert(1)' },
                }],
            }),
        };
        installTargetExampleSources(document.body, {
            settings: japaneseTarget(),
            term: '水',
            sourceAttributes: () => 'data-safe-marker="kept" onclick="window.__yomuUnsafe = true"',
            adapters: [adapter],
        });

        await vi.waitFor(() => expect(document.body.querySelector('[data-example-source="immersion-kit"]')?.getAttribute('data-availability')).toBe('loaded'));
        const loaded = document.body.querySelector<HTMLElement>('[data-example-source="immersion-kit"]')!;
        expect(loaded.dataset.safeMarker).toBe('kept');
        expect(loaded.getAttribute('onclick')).toBeNull();
        expect(loaded.querySelector('[data-example-provenance] a')?.getAttribute('href')).toBeNull();
        expect(loaded.querySelector('[data-provider-example-sentence]')?.textContent).toContain('<img src=x');
        expect(loaded.querySelector('img')).toBeNull();
    });
});

// A deterministic Japanese backend response for retry/ownership tests. These
// are fixture sentences, not claims about a live ImmersionKit corpus.
const JAPANESE_EXAMPLES: ImmersionKitExample[] = ['水を飲む。', '水が冷たい。'].map((sentence, index) => ({
    id: String(index), sentence, sentenceWithFurigana: sentence, translation: '',
    sourceTitle: 'Fixture', titleSlug: 'fixture', category: '',
    soundFile: '', imageFile: '', soundUrl: '', imageUrl: '',
}));

function record(): ExampleRecord {
    return {
        id: 'tatoeba:1',
        text: { value: 'El agua está fría.', language: 'spa' },
        translation: { value: 'The water is cold.', language: 'eng', provenance: 'source', direct: true },
        source: { name: 'Tatoeba', url: 'https://tatoeba.org/en/sentences/show/1', licence: 'CC BY 2.0 FR', attribution: 'Tatoeba — x' },
    };
}

function japaneseTarget(): ReaderSettings {
    return normalizeReaderSettings({ ...DEFAULT_SETTINGS, immersionKitEnabled: true });
}

function spanishTarget(): ReaderSettings {
    return normalizeReaderSettings({
        ...DEFAULT_SETTINGS,
        immersionKitEnabled: true,
        interfaceLanguage: 'en',
        activeLanguageProfileId: 'es-target',
        languageProfiles: [{
            schemaVersion: 2,
            id: 'es-target',
            outputLanguage: 'en',
            learnerLanguage: 'en',
            targetLanguage: 'es',
            uiLocale: 'en',
            parserProvider: 'local',
            dictionaries: { installed: [], enabled: [], order: [] },
            definitionTranslationProviderIds: [],
        }],
    } as unknown as Partial<ReaderSettings>);
}
