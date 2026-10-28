import { afterEach, describe, expect, it } from 'vitest';

import { collectScanTargets, getMatchingSiteParsers } from '../../src/reader/app/site-parsers';
import { applyTokensToScanTarget, removeNonDestructiveScanMirrors, readerWordSurfaceText, type ScanTextTarget } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBToken } from '../../src/reader/app/types';
import { mockElementBoundingClientRect } from './helpers/dom-fixtures';

const YOMUYOMU_STORY_URL = 'https://yomuyomu.app/lessons/950-replying-with-only-a-i-u-e-o?from=latest';

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

describe('canvas fallback text layers', () => {
    it('turns YomuYomu story canvas fallback text into a transparent native overlay', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 924, height: 1520 });
        document.body.innerHTML = `
            <div id="vue-root" data-v-app>
                <div id="du-lesson-container">
                    <div id="du-reading-screen">
                        <div class="lesson-canvas-container">
                            <div class="lesson-canvas-clipper">
                                <canvas width="924" height="1520" lang="ja-Jpan">「あいうえお」だけで返事しちゃおう

　会話をしているときに、「返事って、そんなに長くなくていいよね」と、思ったことがありませんか？
　実は日本語には、短いのに便利な返事があります。</canvas>
                            </div>
                        </div>
                    </div>
                    <button type="button">再生</button>
                </div>
            </div>
        `;

        const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
        const targets = collectScanTargets(10, YOMUYOMU_STORY_URL);
        rectSpy.mockRestore();

        expect(getMatchingSiteParsers(YOMUYOMU_STORY_URL).map(profile => profile.id))
            .toContain('yomuyomu-reader-parser');
        const story = targets.find(target => target.text.includes('会話をしているとき'))!;
        expect(story).toMatchObject({
            parserId: 'yomuyomu-reader-parser',
            nonDestructive: true,
        });
        expect(story.parent).toBe(canvas);

        applyTokensToScanTarget(story, [tokenFor(story, '会話', 'かいわ')], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const layer = document.querySelector<HTMLElement>('.jpdb-reader-canvas-text-layer')!;
        const word = layer.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(layer.parentElement).toBe(canvas.parentElement);
        expect(layer.classList.contains('jpdb-reader-native-canvas')).toBe(true);
        expect(layer.dataset.sourceText).toBe(story.text);
        expect(layer.style.whiteSpace).toBe('pre-wrap');
        expect(layer.style.opacity).toBe('0');
        expect(layer.style.pointerEvents).toBe('none');
        expect(canvas.style.visibility).toBe('');
        expect(word.dataset.jpdbReaderPassive).toBe('true');
        expect(word.querySelector('rt')).toBeNull();
        expect(readerWordSurfaceText(word)).toBe('会話');

        expect(removeNonDestructiveScanMirrors(document)).toBe(1);
        expect(document.querySelector('.jpdb-reader-canvas-text-layer')).toBeNull();
        expect(canvas.style.visibility).toBe('');
    });

    it('keeps the default canvas fallback replacement mode for non-native canvas text', () => {
        document.body.innerHTML = `
            <div class="canvas-reader">
                <canvas width="400" height="240" lang="ja">今日は本を読みます。</canvas>
            </div>
        `;
        const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
        const target: ScanTextTarget = {
            text: canvas.textContent?.trim() ?? '',
            parent: canvas,
            fragments: [],
            layoutSensitive: true,
            nonDestructive: true,
        };

        applyTokensToScanTarget(target, [tokenFor(target, '本', 'ほん')], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const layer = document.querySelector<HTMLElement>('.jpdb-reader-canvas-text-layer')!;
        expect(layer.classList.contains('jpdb-reader-native-canvas')).toBe(false);
        expect(layer.style.opacity).toBe('');
        expect(layer.style.pointerEvents).toBe('auto');
        expect(canvas.style.visibility).toBe('hidden');

        expect(removeNonDestructiveScanMirrors(document)).toBe(1);
        expect(canvas.style.visibility).toBe('');
    });
});

function tokenFor(target: ScanTextTarget, surface: string, reading: string): JPDBToken {
    const start = target.text.indexOf(surface);
    expect(start).toBeGreaterThanOrEqual(0);
    return {
        card: {
            vid: 1,
            sid: 1,
            rid: 1,
            spelling: surface,
            reading,
            frequencyRank: null,
            meanings: [{ glosses: ['conversation'], partOfSpeech: ['n'] }],
            partOfSpeech: ['n'],
            pitchAccent: [],
            cardState: ['not-in-deck'],
            wordWithReading: null,
            source: 'jpdb',
        },
        start,
        end: start + surface.length,
        length: surface.length,
        rubies: [{ text: reading, start, end: start + surface.length, length: surface.length }],
        pitchClass: 'heiban',
        sentence: target.text,
    };
}
