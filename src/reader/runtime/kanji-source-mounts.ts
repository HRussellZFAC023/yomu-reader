import { IMMERSION_KIT_SOURCE_ID } from '../app/constants';
import { escapeHtml } from '../dom/index';
import { kanjiSourceStateKey } from '../sources/definition-render';
import { uiText } from '../app/i18n';
import {
    KANJI_DICTIONARIES_SOURCE_ID,
    KANJI_JPDB_SOURCE_ID,
    KANJI_ORIGINS_SOURCE_ID,
    KANJI_RTK_SOURCE_ID,
    KANJI_STROKE_SOURCE_ID,
    KANJI_WANIKANI_SOURCE_ID,
    kanjiDictionaryNameFromSourceId,
    orderedKanjiSourceIds,
} from '../sources/sections';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';

const KANJI_STATIC_SOURCE_MOUNTS: Partial<Record<string, string>> = {
    [KANJI_JPDB_SOURCE_ID]: '<div data-kanji-jpdb-mount></div>',
    [KANJI_RTK_SOURCE_ID]: '<div data-kanji-rtk-mount></div>',
    [KANJI_ORIGINS_SOURCE_ID]: '<div data-kanji-origin-mount></div>',
    [KANJI_WANIKANI_SOURCE_ID]: '<div data-kanji-wanikani-mount></div>',
    [KANJI_DICTIONARIES_SOURCE_ID]: '<div data-kanji-definitions-mount></div>',
};

type KanjiSourceMountRendererOptions = {
    settings: ReaderSettings;
    kanji: string;
    language: InterfaceLanguage;
    isSourceOpen: (key: string) => boolean;
    sourceAttributes: (key: string, initiallyExpanded?: boolean) => string;
    sourceTitle: (sourceId: string) => string;
    renderImmersionMount?: () => string;
    staticMounts?: Partial<Record<string, string>>;
};

export function renderKanjiSourceMounts(options: KanjiSourceMountRendererOptions): string {
    const mounts: string[] = [];
    for (const sourceId of orderedKanjiSourceIds(options.settings)) {
        const mount = renderKanjiSourceMount(sourceId, options);
        if (mount) mounts.push(mount);
    }
    return mounts.join('');
}

export function renderKanjiImmersionKitMount(settings: ReaderSettings, sourceAttributes: (key: string, initiallyExpanded?: boolean) => string): string {
    if (!settings.immersionKitEnabled || !settings.kanjiImmersionKitEnabled) return '';
    const sourceStateKey = kanjiSourceStateKey(IMMERSION_KIT_SOURCE_ID);
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit ${sourceAttributes(sourceStateKey, false)}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${uiText(settings.interfaceLanguage, 'immersionKit')}</summary>
            <div class="jpdb-reader-help">${uiText(settings.interfaceLanguage, 'loadingExamples')}</div>
        </details>
    `;
}

function renderKanjiSourceMount(sourceId: string, options: KanjiSourceMountRendererOptions): string {
    const staticMount = (options.staticMounts ?? KANJI_STATIC_SOURCE_MOUNTS)[sourceId];
    if (staticMount) return staticMount;

    const sourceStateKey = kanjiSourceStateKey(sourceId);
    if (sourceId === KANJI_STROKE_SOURCE_ID) {
        return renderKanjiPracticeShell(options, sourceStateKey);
    }
    if (sourceId === IMMERSION_KIT_SOURCE_ID) return options.renderImmersionMount?.() ?? '';
    const dictionaryName = kanjiDictionaryNameFromSourceId(sourceId);
    return dictionaryName
        ? `<div data-kanji-definitions-mount data-kanji-dictionary="${escapeHtml(dictionaryName)}" data-kanji-source-id="${escapeHtml(sourceId)}"></div>`
        : '';
}

function renderKanjiPracticeShell(options: KanjiSourceMountRendererOptions, sourceStateKey: string): string {
    const title = options.sourceTitle(KANJI_STROKE_SOURCE_ID);
    const sourceAttributes = options.sourceAttributes(sourceStateKey, options.isSourceOpen(sourceStateKey));
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-kanjivg" ${sourceAttributes}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
            <div class="jpdb-reader-doodle-stage trace-hidden" data-kanji="${escapeHtml(options.kanji)}">
                <div class="jpdb-reader-doodle-ghost" aria-hidden="true" hidden><div class="jpdb-reader-doodle-text-ghost">${escapeHtml(options.kanji)}</div></div>
                <canvas class="jpdb-reader-doodle-canvas" aria-label="${escapeHtml(`${uiText(options.language, 'practiceDrawing')} ${options.kanji}`)}"></canvas>
            </div>
            <div class="jpdb-reader-doodle-tools">
                <span class="jpdb-reader-help">${escapeHtml(uiText(options.language, 'textTrace'))}</span>
                <button class="jpdb-reader-btn jpdb-reader-doodle-control" type="button" data-doodle-trace>${escapeHtml(uiText(options.language, 'showTrace'))}</button>
                <button class="jpdb-reader-btn jpdb-reader-doodle-control" type="button" data-doodle-clear>${escapeHtml(uiText(options.language, 'clear'))}</button>
            </div>
            <div class="jpdb-reader-newtab-doodle-result" data-newtab-doodle-result></div>
        </details>
    `;
}
