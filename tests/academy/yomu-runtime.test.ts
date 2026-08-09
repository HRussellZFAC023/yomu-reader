import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import { readFileSync } from 'node:fs';
import { collectScanTargets } from '../../src/reader/app/site-parsers';
import { applyTokensToScanTarget, collectTextTargetsIn } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { renderStartScreen } from '../../src/academy/ui/start-screen';
import {
    academyRuntimeAssetCandidates,
    initYomuReaderRuntime,
    observeAcademyAnnotationSurfaces,
    refreshAcademyAnnotationSurfaces,
} from '../../src/academy/integration/yomu-runtime';
import { setAcademyReadingSurface } from '../../src/academy/integration/reader-markup';
import { markInstalledReaderRuntime } from '../../src/reader/app/runtime-presence';
import { READER_RUNTIME_MARKER_ID } from '../../src/reader/app/runtime-health';

describe('Academy hosted Yomu runtime', () => {
    it('prefers the Reader bundle next to the hosted Academy before fallbacks', () => {
        expect(academyRuntimeAssetCandidates('yomu.user.js', 'https://example.test/academy/')).toEqual([
            'https://example.test/yomu.user.js',
            'https://example.test/academy/yomu.user.js',
            'https://example.test/yomu-reader/yomu.user.js',
        ]);
        expect(academyRuntimeAssetCandidates(
            'yomu.user.js',
            'https://example.test/academy/',
            's1-cafebabe0000',
        )).toEqual([
            'https://example.test/yomu.user.js?v=s1-cafebabe0000',
            'https://example.test/academy/yomu.user.js?v=s1-cafebabe0000',
            'https://example.test/yomu-reader/yomu.user.js?v=s1-cafebabe0000',
        ]);
    });

    it('makes real Japanese Academy prose eligible for the canonical Reader scan', () => {
        const screen = renderStartScreen('ja', () => undefined);
        document.body.replaceChildren(screen);

        refreshAcademyAnnotationSurfaces(screen);

        const title = screen.querySelector<HTMLElement>('.academy-title');
        const body = screen.querySelector<HTMLElement>('.academy-lede');
        expect(title?.dataset.yomuRuntimeSurface).toBe('academy-copy');
        expect(title?.dataset.yomuFuriganaMode).toBe('all');
        expect(body?.dataset.yomuFuriganaMode).toBe('all');
        expect(collectTextTargetsIn(screen, 40, false).map(target => target.node.textContent)).toEqual(
            expect.arrayContaining([
                'どこから始めましょうか。',
                'いちばん近いものを選んでください。あとで変えられます。',
            ]),
        );
    });

    it('does not boot the Reader for ignored Japanese chrome without readable prose', () => {
        const languageToggle = document.createElement('button');
        languageToggle.lang = 'ja';
        languageToggle.textContent = '日本語';
        languageToggle.dataset.jpdbReaderSurfaceIgnore = '';
        document.body.replaceChildren(languageToggle);

        refreshAcademyAnnotationSurfaces(document.body);
        expect(document.querySelector('[data-yomu-runtime-surface]')).toBeNull();

        const prose = document.createElement('p');
        prose.lang = 'ja';
        prose.textContent = '日本語を読みます。';
        document.body.append(prose);
        refreshAcademyAnnotationSurfaces(document.body);
        expect(prose.dataset.yomuRuntimeSurface).toBe('academy-copy');
    });

    it('discovers Japanese prose and route choices through the real page scanner', () => {
        const screen = renderStartScreen('ja', () => undefined);
        const host = document.createElement('main');
        host.id = 'academy-screen';
        host.append(screen);
        document.body.replaceChildren(host);
        mockVisibleTree(document.body);
        refreshAcademyAnnotationSurfaces(host);

        const scanned = collectScanTargets(100, 'http://127.0.0.1:5175/academy/').map(target => target.text);
        const text = scanned.join('\n');
        expect(text).toContain('どこから始めましょうか。');
        expect(text).toContain('いちばん近いものを選んでください。あとで変えられます。');
        expect(text).toContain('はじめてです');
        expect(text).toContain('いっしょに決めたいです');
    });

    it('stamps Japanese inserted by a later route render without reopening explicit opt-outs', async () => {
        const root = document.createElement('main');
        document.body.replaceChildren(root);
        const lifecycle = observeAcademyAnnotationSurfaces(root);
        const line = document.createElement('p');
        line.lang = 'ja';
        line.textContent = '図書館で日本語を読みます。';
        const optOut = document.createElement('button');
        optOut.dataset.jpdbReaderSurfaceIgnore = '';
        const optOutLabel = document.createElement('span');
        optOutLabel.lang = 'ja';
        optOutLabel.textContent = '見本を隠す';
        optOut.append(optOutLabel);
        root.append(line, optOut);

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(line.dataset.yomuRuntimeSurface).toBe('academy-copy');
        expect(line.dataset.yomuFuriganaMode).toBe('all');
        expect(optOut.dataset.yomuRuntimeSurface).toBeUndefined();
        expect(optOut.dataset.yomuFuriganaMode).toBeUndefined();
        expect(optOutLabel.dataset.yomuRuntimeSurface).toBeUndefined();
        expect(optOutLabel.dataset.yomuFuriganaMode).toBeUndefined();
        lifecycle.dispose();
    });

    it('lets one owning readings state hide and restore every Japanese prose surface', () => {
        const root = document.createElement('main');
        root.dataset.readingSupport = 'hidden';
        const inflected = document.createElement('p');
        inflected.lang = 'ja';
        inflected.textContent = '聞き取れませんでした。';
        const unclassified = document.createElement('p');
        unclassified.lang = 'ja';
        unclassified.textContent = 'もう一度言います。';
        root.append(inflected, unclassified);
        document.body.replaceChildren(root);

        refreshAcademyAnnotationSurfaces(root);
        expect(inflected.getAttribute('data-jpdb-reader-surface-ignore')).not.toBeNull();
        expect(unclassified.dataset.yomuRuntimeSurface).toBeUndefined();

        root.dataset.readingSupport = 'shown';
        refreshAcademyAnnotationSurfaces(root);
        expect(inflected.dataset.yomuRuntimeSurface).toBe('academy-copy');
        expect(unclassified.dataset.yomuFuriganaMode).toBe('all');

        inflected.innerHTML = '<span class="jpdb-reader-word"><ruby>聞き取れませんでした<rt>ききとれませんでした</rt></ruby></span>。';
        root.dataset.readingSupport = 'hidden';
        refreshAcademyAnnotationSurfaces(root);
        expect(inflected.textContent).toBe('聞き取れませんでした。');
        expect(inflected.querySelector('.jpdb-reader-word')).toBeNull();
    });

    it('synchronizes a global readings-toggle mutation across Academy prose surfaces', async () => {
        const root = document.createElement('main');
        root.dataset.readingSupport = 'hidden';
        const classroom = document.createElement('p');
        classroom.className = 'academy-japanese';
        classroom.textContent = '聞きました。';
        const dialogue = document.createElement('p');
        dialogue.lang = 'ja';
        dialogue.textContent = '言いました。会いました。';
        root.append(classroom, dialogue);
        document.body.replaceChildren(root);

        const lifecycle = observeAcademyAnnotationSurfaces(root);
        expect(classroom.getAttribute('data-jpdb-reader-surface-ignore')).not.toBeNull();
        expect(dialogue.getAttribute('data-jpdb-reader-surface-ignore')).not.toBeNull();

        root.dataset.readingSupport = 'shown';
        await settleAnnotationMutation();
        expect(classroom.dataset.yomuRuntimeSurface).toBe('academy-copy');
        expect(dialogue.dataset.yomuFuriganaMode).toBe('all');

        classroom.innerHTML = '<span class="jpdb-reader-word"><ruby>聞きました<rt>ききました</rt></ruby></span>。';
        dialogue.innerHTML = '<span class="jpdb-reader-word"><ruby>言いました<rt>いいました</rt></ruby></span>。<span class="jpdb-reader-word"><ruby>会いました<rt>あいました</rt></ruby></span>。';
        root.dataset.readingSupport = 'hidden';
        await settleAnnotationMutation();
        expect(classroom.textContent).toBe('聞きました。');
        expect(dialogue.textContent).toBe('言いました。会いました。');
        expect(root.querySelector('.jpdb-reader-word')).toBeNull();
        lifecycle.dispose();
    });

    it('restores Reader eligibility after a VN reveal temporarily suppresses a shown line', () => {
        const line = document.createElement('p');
        line.lang = 'ja';
        line.textContent = '聞いてください。';

        setAcademyReadingSurface(line, true, '聞いてください。', 'academy-dialogue');
        expect(line.dataset.yomuRuntimeSurface).toBe('academy-dialogue');

        line.dataset.performanceText = 'revealing';
        line.textContent = '聞いて';
        setAcademyReadingSurface(line, true, '聞いてください。', 'academy-dialogue');
        expect(line.getAttribute('data-jpdb-reader-surface-ignore')).not.toBeNull();

        delete line.dataset.performanceText;
        line.textContent = '聞いてください。';
        setAcademyReadingSurface(line, true, '聞いてください。', 'academy-dialogue');

        expect(line.getAttribute('data-jpdb-reader-surface-ignore')).toBeNull();
        expect(line.dataset.yomuRuntimeSurface).toBe('academy-dialogue');
        expect(line.dataset.yomuFuriganaMode).toBe('all');
    });

    it('forces full ruby and keeps pitch metadata on Academy learning text', () => {
        const root = document.createElement('main');
        const line = document.createElement('p');
        line.lang = 'ja';
        line.textContent = '日本語';
        root.append(line);
        document.body.replaceChildren(root);
        refreshAcademyAnnotationSurfaces(root);
        const target = collectTextTargetsIn(root, 10, false)[0];

        applyTokensToScanTarget(target, [japaneseLanguageToken()], {
            ...DEFAULT_SETTINGS,
            showFurigana: false,
            furiganaMode: 'off',
            showPitchAccent: true,
        });

        const word = root.querySelector<HTMLElement>('.jpdb-reader-word');
        expect(word?.querySelector('rt')?.textContent).toBe('にほんご');
        expect(word?.dataset.pitchClass).toBe('heiban');
        expect(word?.classList.contains('jpdb-pitch-heiban')).toBe(true);
    });

    it('does not treat Reader-generated ruby as a new Academy annotation surface', () => {
        const root = document.createElement('main');
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        const reading = document.createElement('span');
        reading.lang = 'ja';
        reading.className = 'jpdb-reader-furi';
        reading.textContent = 'にほんご';
        word.append(reading);
        root.append(word);

        expect(refreshAcademyAnnotationSurfaces(root)).toBe(0);
        expect(reading.dataset.yomuRuntimeSurface).toBeUndefined();
        expect(reading.dataset.yomuFuriganaMode).toBeUndefined();
    });

    it('keeps Academy reading surfaces on the paper palette regardless of Reader theme', () => {
        const css = readFileSync('src/academy/styles/tokens.css', 'utf8');
        expect(css).toContain('--academy-accent: #5ea780;');
        expect(css).toContain('.academy-root :is([lang="ja"], [lang^="ja-"], .academy-japanese)[data-yomu-runtime-surface]');
        expect(css).toContain('--jpdb-reader-text: var(--academy-paper-ink);');
        expect(css).toContain('--jpdb-reader-accent-readable: var(--academy-paper-ink);');
    });

    it('does not race hosted injection against a runtime announced at document-start', async () => {
        const root = document.createElement('main');
        root.id = 'yomu-academy';
        const prose = document.createElement('p');
        prose.lang = 'ja';
        prose.textContent = '日本語を読みます。';
        root.append(prose);
        document.body.replaceChildren(root);
        const graph = document.createElement('script');
        graph.src = 'https://yomureader.com/hosted-runtime-graph.js?v=s1-cafebabe0000';
        document.head.append(graph);
        markInstalledReaderRuntime('userscript');

        const boot = initYomuReaderRuntime();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(document.querySelector('link[data-yomu-hosted-academy-css]')).toBeNull();
        expect(document.querySelector('script[id^="yomu-hosted-academy-runtime"]')).toBeNull();

        const owner = document.createElement('meta');
        owner.id = READER_RUNTIME_MARKER_ID;
        owner.dataset.yomuRuntimeHealth = 'ready';
        owner.dataset.yomuRuntimeHealthVersion = '1';
        owner.dataset.yomuRuntimeServices = [
            'localization',
            'local-dictionary',
            'jiten',
            'yomu-srs',
            'jpdb',
            'bunpro',
            'translation',
            'grammar',
            'mining',
            'anki',
            'annotation-layout',
            'pitch',
            'audio',
            'nested-lookup',
        ].join(',');
        owner.dataset.yomuRuntimeMissingServices = '';
        document.head.append(owner);

        expect(await boot).toBe(true);
    });
});

function mockVisibleTree(root: HTMLElement): void {
    const rect = {
        x: 0,
        y: 0,
        top: 0,
        right: 320,
        bottom: 40,
        left: 0,
        width: 320,
        height: 40,
        toJSON: () => ({}),
    } as DOMRect;
    for (const element of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
        Object.defineProperty(element, 'getBoundingClientRect', { configurable: true, value: () => rect });
        Object.defineProperty(element, 'getClientRects', { configurable: true, value: () => [rect] });
    }
}

function settleAnnotationMutation(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function japaneseLanguageToken(): JPDBToken {
    const card: JPDBCard = {
        vid: 1,
        sid: 1,
        rid: 0,
        spelling: '日本語',
        reading: 'にほんご',
        frequencyRank: 100,
        partOfSpeech: ['n'],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: ['LHLL'],
        wordWithReading: null,
        source: 'jpdb',
    };
    return {
        card,
        start: 0,
        end: 3,
        length: 3,
        rubies: [{ text: 'にほんご', start: 0, end: 3, length: 3 }],
        pitchClass: 'heiban',
        sentence: '日本語',
    };
}
