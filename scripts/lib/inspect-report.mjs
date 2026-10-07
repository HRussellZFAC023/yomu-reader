import { createHash } from 'node:crypto';

export function requestKey(request) {
    // Include request headers: different language/provider responses must not
    // silently replay a response captured for a different request.
    return createHash('sha256').update(JSON.stringify([
        request.method, request.url, request.data ?? '',
        Object.entries(request.headers ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    ])).digest('hex');
}

export function inspectReportHtml(report) {
    const escape = value => String(value ?? '').replace(/[&<>"']/gu, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
    const rows = report.words.map(word => `<tr><td>${escape(word.text)}<br><small>${escape(word.reading)}</small></td><td>${word.opened ? 'Opened' : 'No popup'}</td><td><details><summary>Popup</summary><pre>${escape(word.popupText)}</pre></details></td></tr>`).join('');
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Yomu inspection</title>
<style>body{font:16px/1.5 system-ui;margin:40px auto;padding:0 20px;max-width:1000px;color:#222}h1{font-size:16px}small{color:#555}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #ddd;vertical-align:top}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}img{max-width:100%;border:1px solid #ddd}summary{cursor:pointer}</style>
<h1>Yomu inspection</h1><p>${escape(report.url)}</p>
<table><thead><tr><th>Word</th><th>Base hover</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table>
<details><summary>Errors</summary><pre>${escape([...report.errors, ...report.missingRequests].join('\n'))}</pre></details>
<details><summary>Run details</summary><p>${escape(report.mode)} · ${escape(report.runtime)}</p><p>An opened popup is not a correctness verdict. This samples visible base text only.</p></details>
<p><a href="report.json">Full JSON and coordinates</a> · <a href="annotated.html">Annotated DOM snapshot</a></p><img src="page.png" alt="Inspected page with the built reader annotations"></html>`;
}
