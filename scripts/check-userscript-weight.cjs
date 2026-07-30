#!/usr/bin/env node
const { join } = require('node:path');
const { userscriptWeightReport } = require('./lib/userscript-weight.cjs');

const ROOT = join(__dirname, '..');

let report;
try {
  report = userscriptWeightReport(ROOT);
} catch (error) {
  console.error(`[userscript-weight] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

for (const file of report.files) {
  console.log(`[userscript-weight] ${file.relativePath}: ${format(file.bytes)} bytes`);
}
console.log(
  `[userscript-weight] injected total: ${format(report.totalBytes)} bytes across `
  + `${report.files.length} unconditional script(s); ratchet ${format(report.maxInjectedBytes)} bytes.`,
);

if (
  report.previousMaxInjectedBytes != null
  && report.maxInjectedBytes > report.previousMaxInjectedBytes
) {
  console.error(
    `[userscript-weight] FAIL: budget increased from ${format(report.previousMaxInjectedBytes)} `
    + `to ${format(report.maxInjectedBytes)} bytes. This ratchet may only move down.`,
  );
  process.exit(1);
}
if (report.totalBytes > report.maxInjectedBytes) {
  console.error(
    `[userscript-weight] FAIL: injected total exceeds the ratchet by `
    + `${format(report.totalBytes - report.maxInjectedBytes)} bytes.`,
  );
  process.exit(1);
}
console.log(`[userscript-weight] PASS: ${format(report.maxInjectedBytes - report.totalBytes)} bytes of headroom.`);

function format(value) {
  return value.toLocaleString('en-US');
}
