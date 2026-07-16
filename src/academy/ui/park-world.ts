import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { ActivityEvaluation } from '../domain/activity-runtime';
import type { WorldPractice } from '../domain/world-locations';
import { completedWorldPracticeEvaluation } from '../domain/world-practice-evidence';
import { element } from './dom';

interface ParkWorldOptions {
    readonly language: AcademyLanguage;
    readonly practice: WorldPractice;
    readonly stampId: string;
    readonly visitCount: number;
    readonly random?: () => number;
    readonly onListen?: (line: string) => Promise<boolean>;
    readonly onSketch?: () => void;
    readonly onPracticeComplete?: (practiceId: string, stampId: string, evaluation?: ActivityEvaluation) => void;
}

const WEATHER_MARKS = [
    { id: 'cloud-silver', ja: '雲の銀色', en: 'Cloud silver' },
    { id: 'leaf-green', ja: '葉の緑', en: 'Leaf green' },
    { id: 'rain-blue', ja: '雨の青', en: 'Rain blue' },
    { id: 'blossom-pink', ja: '花の桃色', en: 'Blossom pink' },
] as const;

/** A place-owned observation surface: listen once, then press the weather into paper. */
export function renderParkWeatherSketchbook(options: ParkWorldOptions): HTMLElement {
    const root = element('section', 'academy-world-practice academy-park-sketchbook');
    root.dataset.worldPractice = options.practice.id;
    root.dataset.parkPractice = 'weather-sketchbook';
    root.dataset.parkVisit = String(options.visitCount);
    root.dataset.parkSource = options.practice.source?.primary.sourceId ?? '';

    const heading = element('h2', 'academy-park-sketchbook-heading');
    heading.id = `academy-park-sketchbook-${options.practice.id}`;
    heading.lang = 'ja';
    heading.textContent = options.practice.sceneLabel?.ja ?? '空のスケッチ';
    root.setAttribute('aria-labelledby', heading.id);

    const season = element('p', 'academy-park-season-tape');
    season.textContent = options.language === 'ja'
        ? options.practice.sceneLabel?.ja ?? '今日の空'
        : options.practice.sceneLabel?.en ?? 'Today\'s sky';

    const phrase = element('p', 'academy-park-weather-phrase');
    phrase.lang = 'ja';
    phrase.textContent = options.practice.audioLine;
    const support = element('p', 'academy-park-weather-support');
    support.hidden = options.language === 'ja';
    support.textContent = options.practice.prompt.en;

    const paper = element('div', 'academy-park-weather-paper');
    paper.setAttribute('aria-hidden', 'true');
    const ink = element('span', 'academy-park-weather-ink');
    const markLabel = element('span', 'academy-park-weather-mark-label');
    paper.append(ink, markLabel);

    const marks = marksFor(options.practice.id);
    let markIndex = Math.abs(options.visitCount) % marks.length;
    let completed = false;
    const showMark = (index: number) => {
        markIndex = index;
        const mark = marks[index]!;
        root.dataset.weatherMark = mark.id;
        markLabel.textContent = mark[options.language];
    };
    showMark(markIndex);

    const controls = element('div', 'academy-park-sketchbook-controls');
    const listen = element('button', 'academy-world-listen academy-park-listen');
    listen.type = 'button';
    listen.dataset.worldListen = options.practice.id;
    listen.textContent = options.language === 'ja' ? '聞く' : 'Listen';
    const press = element('button', 'academy-park-weather-seal');
    press.type = 'button';
    press.dataset.parkWeatherSeal = options.practice.id;
    press.textContent = options.language === 'ja' ? '空を写す' : 'Press the sky';
    const status = element('p', 'academy-world-practice-status academy-park-weather-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    listen.addEventListener('click', () => {
        void (options.onListen?.(options.practice.audioLine) ?? Promise.resolve(false)).then(played => {
            status.textContent = played
                ? options.language === 'ja' ? '空のことばを聞きました。' : 'The weather line is playing.'
                : options.language === 'ja' ? '紙のことばを見てください。' : 'Keep the paper phrase in view.';
        });
    });

    press.addEventListener('click', () => {
        const random = options.random ?? Math.random;
        const offset = 1 + Math.floor(clampUnit(random()) * (marks.length - 1));
        showMark((markIndex + offset) % marks.length);
        root.dataset.sketchPressed = 'true';
        options.onSketch?.();
        status.textContent = completed
            ? options.language === 'ja' ? '新しい空の色を重ねました。' : 'A new sky impression settles on the page.'
            : options.practice.success[options.language];
        press.textContent = options.language === 'ja' ? 'もう一枚' : 'Another impression';
        if (completed) return;
        completed = true;
        root.dataset.practiceComplete = 'true';
        const evaluation = completedWorldPracticeEvaluation(options.practice);
        if (evaluation) options.onPracticeComplete?.(options.practice.id, options.stampId, evaluation);
        else options.onPracticeComplete?.(options.practice.id, options.stampId);
    });

    controls.append(listen, press);
    root.append(season, heading, phrase, support, paper, controls, status);
    return root;
}

function marksFor(practiceId: string): readonly (typeof WEATHER_MARKS)[number][] {
    if (practiceId === 'park-overcast-weather') return [WEATHER_MARKS[0], WEATHER_MARKS[2]];
    if (practiceId === 'park-hyde-description') return [WEATHER_MARKS[1], WEATHER_MARKS[0]];
    return [WEATHER_MARKS[3], WEATHER_MARKS[1]];
}

function clampUnit(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(0.999_999, Math.max(0, value));
}
