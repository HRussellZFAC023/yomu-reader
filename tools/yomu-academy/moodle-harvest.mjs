#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const manifestPath = path.join(repoRoot, 'resources/yomu-academy/moodle-raw/manifest.json');
const rawRoot = path.join(repoRoot, 'resources/yomu-academy/moodle-raw');
const reportPath = path.join(repoRoot, 'artifacts/yomu-academy/reports/download-report.json');
const downloadsDir = path.join(os.homedir(), 'Downloads');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const force = args.has('--force');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : Infinity;
const onlyCourse = valueArg('--course');
const onlySection = valueArg('--section');

function valueArg(name) {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return raw ? raw.slice(name.length + 1) : null;
}

function slug(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'untitled';
}

function moduleUrl(module) {
  if (module.type === 'folder') {
    return `https://moodle.ucl.ac.uk/mod/folder/download_folder.php?id=${module.id}`;
  }
  if (module.type === 'resource') {
    return `https://moodle.ucl.ac.uk/mod/resource/view.php?id=${module.id}`;
  }
  return null;
}

function openInFirefox(url) {
  return new Promise((resolve, reject) => {
    const child = spawn('open', ['-a', 'Firefox Developer Edition', url], {
      stdio: 'ignore'
    });
    child.on('error', reject);
    child.on('close', (code) => {
      code === 0 ? resolve() : reject(new Error(`open exited ${code}`));
    });
  });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function newestDownloadAfter(startMs) {
  const names = await readdir(downloadsDir);
  const entries = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    if (name.endsWith('.part') || name.endsWith('.download') || name.endsWith('.crdownload')) continue;
    const fullPath = path.join(downloadsDir, name);
    let info;
    try {
      info = await stat(fullPath);
    } catch {
      continue;
    }
    if (!info.isFile() || info.mtimeMs < startMs || info.size === 0) continue;
    if (existsSync(`${fullPath}.part`)) continue;
    entries.push({ name, fullPath, mtimeMs: info.mtimeMs, size: info.size });
  }
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return entries[0] ?? null;
}

async function waitForDownload(startMs) {
  let lastPath = null;
  let stableCount = 0;
  let lastSize = -1;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const file = await newestDownloadAfter(startMs);
    if (file) {
      if (file.fullPath === lastPath && file.size === lastSize) {
        stableCount += 1;
      } else {
        stableCount = 0;
        lastPath = file.fullPath;
        lastSize = file.size;
      }
      if (stableCount >= 2) return file;
    }
    await sleep(1000);
  }
  return null;
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const queued = [];
  for (const course of manifest.courses) {
    if (onlyCourse && course.id !== onlyCourse) continue;
    for (const section of course.sections) {
      if (onlySection && section.id !== onlySection) continue;
      for (const [index, module] of section.modules.entries()) {
        const url = module.id ? moduleUrl(module) : null;
        if (!url) continue;
        queued.push({ course, section, module, index, url });
      }
    }
  }

  const report = {
    generated: new Date().toISOString(),
    dryRun,
    requested: queued.length,
    downloaded: [],
    skipped: [],
    failed: []
  };

  let processed = 0;
  for (const item of queued) {
    if (processed >= limit) break;
    processed += 1;
    const { course, section, module, index, url } = item;
    const destDir = path.join(rawRoot, course.id, section.id);
    const prefix = String(index + 1).padStart(2, '0');
    const baseName = `${prefix}-${module.type}-${module.id}-${slug(module.title)}`;
    await mkdir(destDir, { recursive: true });

    const existing = existsSync(destDir)
      ? (await readdir(destDir)).find((name) => name.startsWith(`${baseName}.`))
      : null;
    if (existing && !force) {
      report.skipped.push({ id: module.id, title: module.title, reason: 'exists', path: path.join(destDir, existing) });
      continue;
    }

    if (dryRun) {
      report.skipped.push({ id: module.id, title: module.title, reason: 'dry-run', url });
      continue;
    }

    const startMs = Date.now() - 1000;
    console.log(`Downloading ${course.id}/${section.id}: ${module.id} ${module.title}`);
    try {
      await openInFirefox(url);
      const file = await waitForDownload(startMs);
      if (!file) {
        report.failed.push({ id: module.id, title: module.title, reason: 'timeout', url });
        continue;
      }
      const ext = path.extname(file.name) || (module.type === 'folder' ? '.zip' : '');
      const destPath = path.join(destDir, `${baseName}${ext}`);
      await rename(file.fullPath, destPath);
      report.downloaded.push({
        id: module.id,
        type: module.type,
        title: module.title,
        course: course.id,
        section: section.id,
        sourceFileName: file.name,
        path: destPath
      });
    } catch (error) {
      report.failed.push({ id: module.id, title: module.title, reason: String(error), url });
    }
  }

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${reportPath}`);
  console.log(`Downloaded ${report.downloaded.length}, skipped ${report.skipped.length}, failed ${report.failed.length}`);
  if (report.failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
