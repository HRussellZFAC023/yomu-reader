const http = require('node:http');
const { execFile } = require('node:child_process');
const {
  assertNoRemoteExecutableMetadata,
  byteLengthUtf8,
  failIfGreasyForkSizeExceeded,
  readBuiltUserscript,
} = require('./userscript-build-utils.cjs');

const code = readBuiltUserscript();
const action = process.argv[2] || 'https://greasyfork.org/en/script_versions/prefill';

assertNoRemoteExecutableMetadata(code);
failIfGreasyForkSizeExceeded(byteLengthUtf8(code));

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const server = http.createServer((_, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Publish よむ to GreasyFork</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #15191f; color: #eef2f6; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { width: min(560px, calc(100vw - 32px)); }
  button { min-height: 44px; padding: 0 18px; border-radius: 8px; border: 1px solid #5ea780; background: #5ea780; color: #0d1117; font-weight: 800; cursor: pointer; }
  p { color: #aab2c0; line-height: 1.55; }
</style>
<main>
  <h1>Publish よむ</h1>
  <p>This will send the built userscript to GreasyFork's official prefill form. Make sure you are logged into GreasyFork in this browser first.</p>
  <form method="post" action="${escapeHtml(action)}" enctype="multipart/form-data">
    <textarea hidden name="script_version[code]">${escapeHtml(code)}</textarea>
    <button type="submit">Open GreasyFork prefill</button>
  </form>
</main>`);
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/`;
  console.log(url);
  execFile('open', [url], error => {
    if (error) console.error(error.message);
  });
});
