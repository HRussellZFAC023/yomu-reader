const githubOwner = 'HRussellZFAC023';
const packageName = 'yomu-reader';
const docsUrl = `https://${githubOwner.toLowerCase()}.github.io/${packageName}/`;
const greasyForkLibraryDir = 'greasyfork';

const GREASY_FORK_LIBRARIES = [
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

function greasyForkLibraryPath(fileName) {
  return `${greasyForkLibraryDir}/${fileName}`;
}

function greasyForkLibraryUrl(fileName) {
  return `${docsUrl}${greasyForkLibraryPath(fileName)}`;
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
};
