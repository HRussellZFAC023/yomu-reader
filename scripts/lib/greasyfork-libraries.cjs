const packageVersion = require('../../package.json').version;
const docsUrl = 'https://yomureader.com/';
const greasyForkLibraryDir = 'greasyfork';

const GREASY_FORK_LIBRARIES = [
  {
    id: 'anki',
    label: 'Yomu Anki',
    entry: 'src/reader/companions/anki.ts',
    fileName: 'yomu-anki.user.js',
    globalName: 'YomuAnkiLibrary',
  },
  {
    id: 'kanji-study',
    label: 'Yomu Kanji/Study',
    entry: 'src/reader/companions/kanji-study.ts',
    fileName: 'yomu-kanji-study.user.js',
    globalName: 'YomuKanjiStudyLibrary',
  },
  {
    id: 'ocr-manga',
    label: 'Yomu OCR/Manga',
    entry: 'src/reader/companions/ocr-manga.ts',
    fileName: 'yomu-ocr-manga.user.js',
    globalName: 'YomuOcrMangaLibrary',
  },
  {
    id: 'ui-copy',
    label: 'Yomu UI Copy',
    entry: 'src/reader/companions/ui-copy.ts',
    fileName: 'yomu-ui-copy.user.js',
    globalName: 'YomuUiCopyLibrary',
  },
  {
    id: 'settings-surface',
    label: 'Yomu Settings Surface',
    entry: 'src/reader/companions/settings-surface.ts',
    fileName: 'yomu-settings-surface.user.js',
    globalName: 'YomuSettingsSurfaceLibrary',
  },
  {
    id: 'video',
    label: 'Yomu Video',
    entry: 'src/reader/companions/video.ts',
    fileName: 'yomu-video.user.js',
    globalName: 'YomuVideoLibrary',
  },
];

function readerCssResourceUrl() {
  // Must match rawReaderCssUrl in vite.config.ts. Versioned so
  // Tampermonkey-family managers (which cache @resource content keyed by URL
  // at install time) re-download the sheet on every release.
  return `${docsUrl}yomu.css?v=${encodeURIComponent(packageVersion)}`;
}

function greasyForkLibraryPath(fileName) {
  return `${greasyForkLibraryDir}/${fileName}`;
}

function greasyForkLibraryUrl(fileName) {
  return `${docsUrl}${greasyForkLibraryPath(fileName)}?v=${encodeURIComponent(packageVersion)}`;
}

function greasyForkLibraryUrls() {
  return GREASY_FORK_LIBRARIES.map(library => greasyForkLibraryUrl(library.fileName));
}

module.exports = {
  GREASY_FORK_LIBRARIES,
  greasyForkLibraryDir,
  greasyForkLibraryPath,
  greasyForkLibraryUrl,
  greasyForkLibraryUrls,
  readerCssResourceUrl,
};
