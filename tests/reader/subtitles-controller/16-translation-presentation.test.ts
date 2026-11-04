import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubtitleCue } from '../../../src/reader/subtitles/subtitle-cues';
import { translateSubtitleCues } from '../../../src/reader/subtitles/subtitle-translate';
import { resetGoogleTranslationCacheForTests, translateText } from '../../../src/reader/translation/google';
import type { SubtitleTrackOption } from '../../../src/reader/subtitles/subtitle-track-options';
import { attachVideo, controllerInternals, createInstalledSubtitleController, registerSubtitleControllerCleanup } from './fixtures';

function translatedResponse(text: string): Response {
    return new Response(JSON.stringify({ sentences: [{ trans: text }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
    });
}

function captionText(selector: string): string {
    return document.querySelector(selector)?.textContent ?? '';
}

function filmTracks(): { source: SubtitleTrackOption; target: SubtitleTrackOption } {
    const source: SubtitleTrackOption = { id: 'film-source', label: 'English', language: 'en', kind: 'file', cues: Array.from({ length: 81 }, (_, index) => ({ start: index * 2, end: index * 2 + 2, text: `Source${index}` })) };
    const target: SubtitleTrackOption = { id: 'film-target', label: 'Japanese', language: 'ja', kind: 'file', translatedFromTrackId: source.id, sourceLanguage: 'en', targetLanguage: 'ja' };
    return { source, target };
}

describe('subtitle translation presentation', () => {
    registerSubtitleControllerCleanup();
    afterEach(() => {
        resetGoogleTranslationCacheForTests();
        vi.unstubAllGlobals();
        vi.useRealTimers();
        document.body.replaceChildren();
    });

    it('paints readable Japanese and its matching English together while the parser is delayed', () => {
        const { controller, settings } = createInstalledSubtitleController({
            subtitleOverlayVisible: true, subtitleSecondaryVisible: true,
            parserProvider: 'jpdb', apiKey: 'test-key',
        }, { parseJapanese: () => new Promise(() => undefined) });
        attachVideo(controller, { currentTime: 1 });
        const state = controllerInternals<{
            selectedTrackId: string; secondaryTrackId: string; cues: SubtitleCue[]; secondaryCues: SubtitleCue[];
            updateFromLoadedCues(): void; shouldSuppressNativeCaptions(settings: unknown): boolean;
        }>(controller);
        state.selectedTrackId = 'japanese';
        state.secondaryTrackId = 'english';
        state.cues = [{ start: 0, end: 3, text: '日本語を\n読みます。' }];
        state.secondaryCues = [{ start: 0, end: 3, text: 'I read Japanese.' }];
        state.updateFromLoadedCues();
        expect(document.querySelector('.jpdb-subtitle-primary')?.textContent).toBe('日本語を読みます。');
        expect(document.querySelector('.jpdb-subtitle-primary br')).not.toBeNull();
        expect(document.querySelector('.jpdb-subtitle-secondary')?.textContent).toBe('I read Japanese.');
        expect(state.shouldSuppressNativeCaptions(settings)).toBe(true);
    });

    it('does not use an intra-cue newline as the next cue boundary', async () => {
        const fetch = vi.fn(async (_input: RequestInfo | URL) => translatedResponse('最初の二行\n次の字幕'));
        vi.stubGlobal('fetch', fetch);
        const cues = [{ start: 0, end: 2, text: 'First line\nsecond line' }, { start: 2, end: 4, text: 'Next caption' }];
        const result = await translateSubtitleCues(cues, 'en', 'ja');
        expect(new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get('q')).toBe('First line second line\nNext caption');
        expect(result.map(cue => [cue.start, cue.text])).toEqual([[0, '最初の二行'], [2, '次の字幕']]);
    });

    it.each(['一行だけ', '一行目\n二行目\n余分な行'])('discards ambiguous partial batch output %j instead of assigning it to another cue', async output => {
        vi.stubGlobal('fetch', vi.fn(async () => translatedResponse(output)));
        const cues = [{ start: 0, end: 2, text: 'First' }, { start: 2, end: 4, text: 'Second' }];
        expect(await translateSubtitleCues(cues, 'en', 'ja')).toEqual([]);
        expect(cues.map(cue => cue.text)).toEqual(['First', 'Second']);
    });

    it('retries a rejected batch through the real Google cache and keeps the recovered translation cached', async () => {
        const fetch = vi.fn().mockResolvedValueOnce(translatedResponse('一行だけ')).mockResolvedValueOnce(translatedResponse('第一行\n第二行'));
        vi.stubGlobal('fetch', fetch);
        const cues = [{ start: 0, end: 1, text: 'First' }, { start: 1, end: 2, text: 'Second' }];
        expect(await translateSubtitleCues(cues, 'en', 'ja')).toEqual([]);
        const recovered = await translateSubtitleCues(cues, 'en', 'ja');
        expect(recovered.map(cue => cue.text)).toEqual(['第一行', '第二行']);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(await translateSubtitleCues(cues, 'en', 'ja')).toEqual(recovered);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('rejects a malformed cache hit without evicting another cached translation', async () => {
        const fetch = vi.fn().mockResolvedValueOnce(translatedResponse('別の翻訳'))
            .mockResolvedValueOnce(translatedResponse('一行だけ')).mockResolvedValueOnce(translatedResponse('第一行\n第二行'));
        vi.stubGlobal('fetch', fetch);
        const languages = { sourceLanguage: 'en', outputLanguage: 'ja' };
        await expect(translateText('Other text', languages)).resolves.toBe('別の翻訳');
        await expect(translateText('First\nSecond', languages)).resolves.toBe('一行だけ');
        const cues = [{ start: 0, end: 1, text: 'First' }, { start: 1, end: 2, text: 'Second' }];
        expect(await translateSubtitleCues(cues, 'en', 'ja')).toEqual([]);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect((await translateSubtitleCues(cues, 'en', 'ja')).map(cue => cue.text)).toEqual(['第一行', '第二行']);
        await expect(translateText('Other text', languages)).resolves.toBe('別の翻訳');
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('keeps successful timed translations without relabelling a failed batch as Japanese', async () => {
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(translatedResponse('最初の字幕'))
            .mockRejectedValueOnce(new Error('Offline')));
        const cues = [{ start: 0, end: 2, text: 'First' }, { start: 2, end: 4, text: 'Second' }];
        expect(await translateSubtitleCues(cues, 'en', 'ja', { batchSize: 1 })).toEqual([{ ...cues[0], text: '最初の字幕' }]);
    });

    it('publishes completed batches while a long valid track continues beyond eight seconds', async () => {
        vi.useFakeTimers();
        const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
            const timer = setTimeout(() => resolve(translatedResponse('翻訳済み')), 6000);
            init?.signal?.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(init.signal?.reason);
            }, { once: true });
        }));
        vi.stubGlobal('fetch', fetch);
        const progress = vi.fn();
        let settled = false;
        const pending = translateSubtitleCues([
            { start: 0, end: 2, text: 'First' }, { start: 2, end: 4, text: 'Second' },
        ], 'en', 'ja', { batchSize: 1, onProgress: progress }).then(result => { settled = true; return result; });
        try {
            await vi.advanceTimersByTimeAsync(8100);
            expect(settled).toBe(false);
            expect(progress).toHaveBeenCalledWith([{ start: 0, end: 2, text: '翻訳済み' }]);
            await vi.advanceTimersByTimeAsync(6000);
            expect(await pending).toEqual([{ start: 0, end: 2, text: '翻訳済み' }, { start: 2, end: 4, text: '翻訳済み' }]);
        } finally {
            await vi.advanceTimersByTimeAsync(20_000);
            await pending;
        }
    });

    it('does not attach source-language native text or word offsets to translated Japanese', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => translatedResponse('日本語')));
        const result = await translateSubtitleCues([{
            start: 0, end: 2, text: 'English source', originalText: 'English source',
            words: [{ start: 0, end: 1, text: 'English' }, { start: 1, end: 2, text: 'source' }], wordTimingsExact: true,
        }], 'en', 'ja');
        expect(result).toEqual([{ start: 0, end: 2, text: '日本語' }]);
    });

    it('settles a failed Japanese translation while leaving its English source readable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Offline'); }));
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true, subtitleSecondaryVisible: true, annotationsPaused: true });
        attachVideo(controller, { currentTime: 1 });
        const state = controllerInternals<{
            tracks: Array<{ id: string; kind: 'file'; label: string; language: string; translatedFromTrackId?: string; targetLanguage?: string; sourceLanguage?: string; loadingState?: string; cues?: SubtitleCue[] }>;
            selectTrack(id: string): Promise<void>; selectSecondaryTrack(id: string): Promise<void>;
        }>(controller);
        const source = { id: 'source-en', kind: 'file' as const, label: 'English', language: 'en', cues: [
            { start: 0, end: 2, text: 'Readable source' }, { start: 2, end: 4, text: 'Second source' },
        ] };
        const translated = { id: 'translation-ja', kind: 'file' as const, label: 'Japanese', language: 'ja', translatedFromTrackId: source.id, sourceLanguage: 'en', targetLanguage: 'ja' };
        state.tracks = [source, translated];
        await state.selectSecondaryTrack(source.id);
        await state.selectTrack(translated.id);
        expect(state.tracks[1]?.loadingState).toBe('error');
        expect(captionText('.jpdb-subtitle-primary')).toBe('');
        expect(captionText('.jpdb-subtitle-secondary')).toBe('Readable source');
        expect(state.tracks[1]?.cues).toEqual([]);
    });

    it('publishes a partial film track, keeps the source at untranslated times and completes later cues', async () => {
        let releaseSecond: (value: Response) => void = () => undefined;
        const second = new Promise<Response>(resolve => { releaseSecond = resolve; });
        const fetch = vi.fn(async (input: RequestInfo | URL) => {
            const source = new URL(String(input)).searchParams.get('q') ?? '';
            return source.includes('Source80') ? second : translatedResponse(source.split('\n').map((_, index) => `日本語${index}`).join('\n'));
        });
        vi.stubGlobal('fetch', fetch);
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true, subtitleSecondaryVisible: true, annotationsPaused: true });
        const video = attachVideo(controller, { currentTime: 0.5 });
        const { source, target } = filmTracks();
        const state = controllerInternals<{ tracks: SubtitleTrackOption[]; selectTrack(id: string): Promise<void>; selectSecondaryTrack(id: string): Promise<void>; updateFromLoadedCues(): void }>(controller);
        state.tracks = [source, target];
        await state.selectSecondaryTrack(source.id);
        const pending = state.selectTrack(target.id);
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
        expect(target.loadingState).toBe('partial');
        expect(captionText('.jpdb-subtitle-primary')).toBe('日本語0');
        expect(captionText('.jpdb-subtitle-secondary')).toBe('Source0');
        video.currentTime = 160.5;
        state.updateFromLoadedCues();
        expect(document.querySelector('.jpdb-subtitle-primary')).toBeNull();
        expect(captionText('.jpdb-subtitle-secondary')).toBe('Source80');
        releaseSecond(translatedResponse('最後の日本語'));
        await pending;
        expect(target.loadingState).toBe('ready');
        expect(target.cues).toHaveLength(81);
        expect(captionText('.jpdb-subtitle-primary')).toBe('最後の日本語');
        expect(captionText('.jpdb-subtitle-secondary')).toBe('Source80');
    });

    it('never aligns an available machine translation to the adjacent missing cue', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true, subtitleSecondaryVisible: true, annotationsPaused: true });
        const video = attachVideo(controller, { currentTime: 0.05 });
        const first = { start: 0, end: 0.1, text: '最初の字幕' };
        const state = controllerInternals<{ tracks: SubtitleTrackOption[]; selectedTrackId: string; secondaryTrackId: string; cues: SubtitleCue[]; secondaryCues: SubtitleCue[]; updateFromLoadedCues(): void }>(controller);
        state.selectedTrackId = 'partial-target';
        state.secondaryTrackId = 'partial-source';
        state.tracks = [{ id: 'partial-target', label: 'Japanese', kind: 'file', language: 'ja', translationOutcome: 'partial' }];
        state.cues = [first];
        state.secondaryCues = [{ ...first, text: 'First' }, { start: 0.1, end: 0.2, text: 'Missing translation' }];
        state.updateFromLoadedCues();
        video.currentTime = 0.15;
        state.updateFromLoadedCues();
        expect(document.querySelector('.jpdb-subtitle-primary')).toBeNull();
        expect(document.querySelector('.jpdb-subtitle-secondary')?.textContent).toBe('Missing translation');
    });

    it.each(['primary', 'secondary'])('withdraws an automatic one-cue %s credit without dropping the listed track', async role => {
        const { controller } = createInstalledSubtitleController({ annotationsPaused: true });
        const state = controllerInternals<{
            tracks: SubtitleTrackOption[]; selectedTrackId: string; secondaryTrackId: string;
            selectTrack(id: string, options: { auto: boolean }): Promise<void>; selectSecondaryTrack(id: string, options: { auto: boolean }): Promise<void>;
        }>(controller);
        state.tracks = [{ id: 'credit', label: 'Credit', kind: 'file', language: 'ja', cues: [{ start: 0, end: 2, text: '字幕制作' }] }];
        if (role === 'primary') await state.selectTrack('credit', { auto: true });
        else await state.selectSecondaryTrack('credit', { auto: true });
        expect(state.selectedTrackId).toBe('');
        expect(state.secondaryTrackId).toBe('');
        expect(state.tracks).toHaveLength(1);
    });

    it('keeps the one successful cue from a partly translated film selected automatically', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('First batch offline')).mockResolvedValueOnce(translatedResponse('最後の日本語')));
        const { controller } = createInstalledSubtitleController({ annotationsPaused: true, subtitleOverlayVisible: true, subtitleSecondaryVisible: true });
        attachVideo(controller, { currentTime: 160.5 });
        const { source, target } = filmTracks();
        const state = controllerInternals<{ tracks: SubtitleTrackOption[]; selectedTrackId: string; selectTrack(id: string, options: { auto: boolean }): Promise<void>; selectSecondaryTrack(id: string): Promise<void> }>(controller);
        state.tracks = [source, target];
        await state.selectSecondaryTrack(source.id);
        await state.selectTrack(target.id, { auto: true });
        expect(state.selectedTrackId).toBe(target.id);
        expect(target.cues).toHaveLength(1);
        expect(target.loadingState).toBe('partial');
        expect(captionText('.jpdb-subtitle-primary')).toBe('最後の日本語');
        expect(captionText('.jpdb-subtitle-secondary')).toBe('Source80');
    });
});
