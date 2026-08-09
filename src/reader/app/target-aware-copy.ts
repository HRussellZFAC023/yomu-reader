import { APP_NAME } from './constants';

/**
 * Copy whose meaning depends on the active learning target rather than the
 * definition/output or interface language.
 */
export const TARGET_AWARE_UI_COPY = Object.freeze({
    en: Object.freeze({
        puckStudyTarget: 'Study {language}',
        puckLearningTarget: `${APP_NAME} — learning target: {language}`,
        puckAutoDetectTargetSubtitles: 'Auto-detect {language} subtitles',
        puckFilterYoutubeTarget: 'Filter YouTube for {language}',
        popupLanguageAxes: 'Reading {target} · Definitions/translation: {output}',
        contextOccurrences: 'In context ×{count}',
        loadTargetSubtitles: 'Load {language} subtitles',
        loadOutputSubtitles: 'Load {language} subtitles',
        readingAnnotations: 'Reading annotations',
        hideReadingsFor: 'Hide readings for',
    }),
    ja: Object.freeze({
        puckStudyTarget: '{language}を学習',
        puckLearningTarget: `${APP_NAME} — 学習対象：{language}`,
        puckAutoDetectTargetSubtitles: '{language}の字幕を自動検出',
        puckFilterYoutubeTarget: 'YouTubeを{language}向けに絞る',
        popupLanguageAxes: '学習対象：{target}・定義/翻訳：{output}',
        contextOccurrences: '文脈内 ×{count}',
        loadTargetSubtitles: '{language}字幕を読み込む',
        loadOutputSubtitles: '{language}字幕を読み込む',
        readingAnnotations: '読みの注釈',
        hideReadingsFor: '読みを隠す対象',
    }),
});
