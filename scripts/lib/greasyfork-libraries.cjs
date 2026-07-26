const packageVersion = require('../../package.json').version;
const docsUrl = 'https://yomureader.com/';
const greasyForkLibraryDir = 'greasyfork';

const GREASY_FORK_LIBRARIES = [
  {
    id: 'annotations',
    label: 'Yomu Annotations',
    entry: 'src/reader/companions/annotations.ts',
    fileName: 'yomu-annotations.user.js',
    globalName: 'YomuAnnotationsLibrary',
  },
  {
    id: 'anki',
    label: 'Yomu Anki',
    entry: 'src/reader/companions/anki.ts',
    fileName: 'yomu-anki.user.js',
    globalName: 'YomuAnkiLibrary',
  },
  {
    id: 'audio',
    label: 'Yomu Audio',
    entry: 'src/reader/companions/audio.ts',
    fileName: 'yomu-audio.user.js',
    globalName: 'YomuAudioLibrary',
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
    id: 'bunpro',
    label: 'Yomu Bunpro',
    entry: 'src/reader/companions/bunpro.ts',
    fileName: 'yomu-bunpro.user.js',
    globalName: 'YomuBunproLibrary',
  },
  {
    id: 'jpdb',
    label: 'Yomu JPDB',
    entry: 'src/reader/companions/jpdb.ts',
    fileName: 'yomu-jpdb.user.js',
    globalName: 'YomuJpdbLibrary',
  },
  {
    id: 'jiten',
    label: 'Yomu Jiten',
    entry: 'src/reader/companions/jiten.ts',
    fileName: 'yomu-jiten.user.js',
    globalName: 'YomuJitenLibrary',
  },
  {
    id: 'wanikani',
    label: 'Yomu WaniKani',
    entry: 'src/reader/companions/wanikani.ts',
    fileName: 'yomu-wanikani.user.js',
    globalName: 'YomuWanikaniLibrary',
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

// ---------------------------------------------------------------------------
// Immutable (content-addressed) publication names.
//
// The final userscript header must @require companion URLs whose CONTENT can
// never change: script managers pin each URL with a #sha256= fragment at
// install time and re-validate whenever they refresh externals. The old
// `?v=<version>` URLs all pointed at ONE mutable file per companion, so the
// moment a newer release deployed, every previously pinned URL started
// serving different bytes — the hash check failed and Tampermonkey silently
// refused to run the whole script on every site. Content-addressed filenames
// make each published companion byte-frozen forever; a new release publishes
// a NEW filename and old installed headers keep validating against the old
// files, which remain deployed.
// ---------------------------------------------------------------------------

function contentHash12(content) {
  return require('node:crypto').createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function immutableLibraryFileName(fileName, content) {
  // yomu-anki.user.js + hash -> yomu-anki.<hash12>.user.js
  return fileName.replace(/\.user\.js$/, `.${contentHash12(content)}.user.js`);
}

function immutableLibraryUrl(fileName, content) {
  return `${docsUrl}${greasyForkLibraryDir}/${immutableLibraryFileName(fileName, content)}`;
}

function immutableReaderCssFileName(content) {
  return `yomu.${contentHash12(content)}.css`;
}

function immutableReaderCssUrl(content) {
  return `${docsUrl}${immutableReaderCssFileName(content)}`;
}

module.exports = {
  GREASY_FORK_LIBRARIES,
  greasyForkLibraryDir,
  greasyForkLibraryPath,
  greasyForkLibraryUrl,
  greasyForkLibraryUrls,
  immutableLibraryFileName,
  immutableLibraryUrl,
  immutableReaderCssFileName,
  immutableReaderCssUrl,
  readerCssResourceUrl,
};
