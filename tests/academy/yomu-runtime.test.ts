import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import { collectScanTargets } from '../../src/reader/app/site-parsers';
import { applyTokensToScanTarget, collectTextTargetsIn } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { renderStartScreen } from '../../src/academy/ui/start-screen';
import {
    academyRuntimeAssetCandidates,
    observeAcademyAnnotationSurfaces,
    refreshAcademyAnnotationSurfaces,
} from '../../src/academy/integration/yomu-runtime';

describe('Academy hosted Yomu runtime', () => {
    it('prefers the Reader bundle next to the hosted Academy before fallbacks', () => {
        expect(academyRuntimeAssetCandidates('yomu.user.js', 'https://example.test/academy/')).toEqual([
            'https://example.test/yomu.user.js',
            'https://example.test/academy/yomu.user.js',
            'https://example.test/yomu-reader/yomu.user.js',
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
            expect.arrayContaining(['どこから始めましょうか。', 'あとで変更できます。']),
        );
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
        expect(text).toContain('あとで変更できます。');
        expect(text).toContain('レッスン0から始める');
        expect(text).toContain('短いプレイスメント模試を受ける');
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
