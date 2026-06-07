#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import imagePromptReplacementDefs from '../src/reader/dictionaries/uchisen-image-prompt-replacements.json' with { type: 'json' };
import { createYomuPaths } from './lib/paths.mjs';

const DEFAULT_CHECKPOINT = path.join(createYomuPaths(import.meta.dirname).workspaceRoot, 'artifacts', 'uchisen-bulk', 'checkpoint.json');
const UCHISEN_ORIGIN = 'https://uchisen.com';
const IMAGE_PROMPT_REPLACEMENTS = imagePromptReplacementDefs.map(([pattern, replacement]) => [new RegExp(pattern, 'gi'), replacement]);
const BOOLEAN_ARG_HANDLERS = new Map([
  ['--live', parsed => { parsed.live = true; }],
  ['--no-resume', parsed => { parsed.resume = false; }],
  ['--retry-failed', parsed => { parsed.retryFailed = true; }],
  ['--stop-on-error', parsed => { parsed.stopOnError = true; }],
]);
const VALUE_ARG_HANDLERS = new Map([
  ['--input', (parsed, value) => { parsed.input = value; }],
  ['--checkpoint', (parsed, value) => { parsed.checkpoint = value; }],
  ['--limit', (parsed, value) => { parsed.limit = Number(value); }],
  ['--delay-ms', (parsed, value) => { parsed.delayMs = Number(value); }],
]);
const FAILURE_SUCCESS_VALUES = new Set([false, 0, '0']);

class CookieJar {
  constructor(initialCookie = '') {
    this.cookies = new Map();
    for (const part of initialCookie.split(';')) {
      const [name, ...value] = part.trim().split('=');
      if (name && value.length) this.cookies.set(name, value.join('='));
    }
  }

  hasCookies() {
    return this.cookies.size > 0;
  }

  header() {
    return Array.from(this.cookies, ([name, value]) => `${name}=${value}`).join('; ');
  }

  store(headers) {
    for (const cookie of setCookieHeaders(headers)) {
      const [pair] = cookie.split(';');
      const [name, ...value] = pair.split('=');
      if (name && value.length) this.cookies.set(name.trim(), value.join('=').trim());
    }
  }
}

function setCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const cookie = headers.get('set-cookie');
  return cookie ? [cookie] : [];
}

const options = parseArgs(process.argv.slice(2));
if (!options.input) {
  console.error('Usage: node scripts/uchisen-bulk-publish.mjs --input queue.jsonl [--live] [--limit N] [--delay-ms N] [--checkpoint file]');
  process.exit(1);
}

const inputPath = path.resolve(options.input);
const checkpointPath = path.resolve(options.checkpoint ?? DEFAULT_CHECKPOINT);
const checkpoint = await readCheckpoint(checkpointPath);
const jar = new CookieJar(process.env.UCHISEN_COOKIE ?? '');

if (options.live && !jar.hasCookies()) {
  await loginWithEnv(jar);
}
if (options.live) {
  await verifyLogin(jar);
}

const queue = await readQueue(inputPath);
const selected = queue
  .filter(item => !options.resume || (!checkpoint.completed[itemKey(item)] && (options.retryFailed || !checkpoint.failed[itemKey(item)])))
  .slice(0, options.limit ?? queue.length);

console.log(JSON.stringify({
  mode: options.live ? 'live' : 'dry-run',
  input: inputPath,
  checkpoint: checkpointPath,
  total: queue.length,
  selected: selected.length,
  alreadyCompleted: Object.keys(checkpoint.completed).length,
  alreadyFailed: Object.keys(checkpoint.failed).length,
}, null, 2));

for (const item of selected) {
  const key = itemKey(item);
  try {
    validateItem(item);
    if (!options.live) {
      console.log(`[dry-run] ${key} ${item.keyword ?? ''}: ready`);
      checkpoint.dryRuns[key] = { at: new Date().toISOString(), kanji: item.kanji };
      await writeCheckpoint(checkpointPath, checkpoint);
      continue;
    }

    const result = await generateAndPublish(item, jar);
    checkpoint.completed[key] = { at: new Date().toISOString(), ...result };
    delete checkpoint.failed[key];
    await writeCheckpoint(checkpointPath, checkpoint);
    console.log(`[posted] ${key} -> ${result.imageFilename}`);
  } catch (error) {
    checkpoint.failed[key] = { at: new Date().toISOString(), error: error.message, kanji: item.kanji };
    await writeCheckpoint(checkpointPath, checkpoint);
    console.error(`[failed] ${key}: ${error.message}`);
    if (options.stopOnError) process.exit(1);
  }
  if (options.delayMs > 0) await sleep(options.delayMs);
}

async function generateAndPublish(item, jar) {
  const referrer = `${UCHISEN_ORIGIN}/kanji/${encodeURIComponent(item.kanji)}`;
  const imagePrompt = itemText(item, 'image_prompt', 'imagePrompt');
  const mnemonic = itemText(item, 'mnemonic');
  const storyPrompt = storyBackedImagePrompt(mnemonic, imagePrompt);
  const safePrompt = safeImagePrompt(storyPrompt);
  const kanjiId = itemText(item, 'kanji_id', 'kanjiId');

  await primeKanjiPage(referrer, jar);

  const { generation, publishedImagePrompt } = await generateImageWithRetry(imagePrompt, storyPrompt, safePrompt, kanjiId, referrer, jar);
  const imageFilename = generation.imageFilename;

  await postForm(`${UCHISEN_ORIGIN}/save_mnemonic.php`, {
    img_src: imageFilename,
    kanji_id: kanjiId,
    formatted_mnemonic: formatMnemonicHtml(mnemonic),
    current_image_prompt: publishedImagePrompt,
    redirect: `/kanji/${encodeURIComponent(item.kanji)}`,
    mnemonic,
    image_prompt: publishedImagePrompt,
    start_blurred: 'no',
  }, referrer, jar);

  return {
    kanji: item.kanji,
    kanji_id: kanjiId,
    imageFilename,
    imageUrl: generation.imageUrl,
  };
}

function itemText(item, ...keys) {
  return String(firstDefinedItemValue(item, keys) ?? '').trim();
}

function firstDefinedItemValue(item, keys) {
  for (const key of keys) {
    if (item[key] != null) return item[key];
  }
  return '';
}

async function generateImageWithRetry(imagePrompt, storyPrompt, safePrompt, kanjiId, referrer, jar) {
  const attempts = uniquePrompts([imagePrompt, storyPrompt, safePrompt]);
  let lastError;
  for (const prompt of attempts) {
    try {
      const generationText = await postForm(`${UCHISEN_ORIGIN}/generateimage`, {
        prompt: escapeUchisenPrompt(prompt),
        kanji_id: kanjiId,
      }, referrer, jar);
      return { generation: parseGenerationResponse(generationText), publishedImagePrompt: prompt };
    } catch (error) {
      lastError = error;
      if (prompt !== attempts[attempts.length - 1]) {
        console.warn(`Image generation failed; retrying with more context (${error.message})`);
      }
    }
  }
  throw lastError;
}

function storyBackedImagePrompt(mnemonic, imagePrompt) {
  const story = plainMnemonic(mnemonic).replace(/\s+/g, ' ').trim();
  if (!story) return imagePrompt;
  return fitImagePrompt(`${imagePrompt}; scene follows this mnemonic story: ${story}`);
}

function uniquePrompts(prompts) {
  const seen = new Set();
  const unique = [];
  for (const prompt of prompts) {
    const trimmed = String(prompt).trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}

function fitImagePrompt(prompt) {
  const maxLength = 400;
  if (prompt.length <= maxLength) return prompt;
  const suffix = /;\s*no text or signage$/i.test(prompt) ? '; no text or signage' : '';
  const targetLength = suffix ? maxLength - suffix.length : maxLength;
  return `${prompt.slice(0, targetLength).replace(/[;,\s]+$/, '')}${suffix}`;
}

function plainMnemonic(text) {
  return String(text)
    .replace(/##([^#]+)##/g, '$1')
    .replace(/#([^#]+)#/g, '$1')
    .replace(/#nl#/g, ' ');
}

async function primeKanjiPage(referrer, jar) {
  const response = await fetch(referrer, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.5',
      Cookie: jar.header(),
      'User-Agent': 'Mozilla/5.0 yomu-uchisen-bulk',
    },
  });
  jar.store(response.headers);
  if (!response.ok) throw new Error(`Could not load Uchisen kanji page before publishing (${response.status}).`);
  await response.arrayBuffer();
}

async function loginWithEnv(jar) {
  const username = process.env.UCHISEN_USERNAME;
  const password = process.env.UCHISEN_PASSWORD;
  if (!username || !password) {
    throw new Error('Live mode needs UCHISEN_COOKIE or UCHISEN_USERNAME and UCHISEN_PASSWORD in the environment.');
  }
  const loginPage = await fetch(`${UCHISEN_ORIGIN}/login`, {
    headers: {
      Cookie: jar.header(),
      'User-Agent': 'Mozilla/5.0 yomu-uchisen-bulk',
    },
  });
  jar.store(loginPage.headers);
  const response = await fetch(`${UCHISEN_ORIGIN}/login_script.php`, {
    method: 'POST',
    body: new URLSearchParams({
      username,
      password,
      timezone: '',
      dst: '',
      Submit: 'Login',
    }),
    redirect: 'manual',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.5',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Cookie: jar.header(),
      Referer: `${UCHISEN_ORIGIN}/login`,
      Origin: UCHISEN_ORIGIN,
      'User-Agent': 'Mozilla/5.0 yomu-uchisen-bulk',
    },
  });
  jar.store(response.headers);
  if (!jar.hasCookies()) throw new Error('Login did not return a usable Uchisen cookie.');
}

async function verifyLogin(jar) {
  const dashboard = await fetch(`${UCHISEN_ORIGIN}/dashboard`, {
    headers: {
      Cookie: jar.header(),
      'User-Agent': 'Mozilla/5.0 yomu-uchisen-bulk',
    },
    redirect: 'manual',
  });
  jar.store(dashboard.headers);
  const dashboardText = await dashboard.text();
  if (isLoginPageResponse(dashboard, dashboardText)) {
    throw new Error('Uchisen login did not reach the dashboard; check the account credentials or cookie.');
  }
}

function isLoginPageResponse(response, text) {
  return response.status >= 300 || hasLoginLocation(response) || /login_script|name="password"/i.test(text);
}

function hasLoginLocation(response) {
  return /login/i.test(response.headers.get('location') ?? '');
}

async function postForm(url, fields, referrer, jar) {
  const response = await fetch(url, {
    method: 'POST',
    body: new URLSearchParams(fields),
    headers: {
      Accept: 'text/html, */*; q=0.01',
      'Accept-Language': 'en-GB,en;q=0.5',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: UCHISEN_ORIGIN,
      Referer: referrer,
      Cookie: jar.header(),
      'User-Agent': 'Mozilla/5.0 yomu-uchisen-bulk',
    },
  });
  jar.store(response.headers);
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  if (/login|account is needed/i.test(text) && !/success/i.test(text)) throw new Error(`Uchisen rejected the request; check authentication for ${url}`);
  return text;
}

function parseGenerationResponse(text) {
  const parsed = requireGenerationPayload(text);
  const rawFilename = firstString(parsed.url, parsed.filename, parsed.file, parsed.img_src, parsed.image_url, parsed.imageUrl);
  const rawFullUrl = firstString(parsed.full_url, parsed.image_url, parsed.imageUrl);
  const imageFilename = requireGeneratedImageFilename(rawFilename, text);
  return {
    ...parsed,
    imageFilename,
    imageUrl: rawFullUrl || `https://ik.imagekit.io/uchisen/generated/saved/${imageFilename}`,
  };
}

function requireGenerationPayload(text) {
  const parsed = parseJsonish(text);
  if (isInvalidGenerationPayload(parsed)) throw new Error(generationFailureMessage(parsed, text));
  return parsed;
}

function isInvalidGenerationPayload(parsed) {
  return !parsed || isGenerationFailure(parsed);
}

function requireGeneratedImageFilename(rawFilename, text) {
  const imageFilename = normalizeImageFilename(rawFilename);
  if (!imageFilename) throw new Error(`Image generation did not return a filename: ${snippet(text)}`);
  return imageFilename;
}

function generationFailureMessage(parsed, text) {
  const message = generationErrorMessage(parsed);
  if (!message) return `Uchisen image backend rejected generation: ${snippet(text)}`;
  if (isLoginFailureMessage(message)) return message;
  const detail = generationFailureDetail(message, parsed);
  return `Uchisen image backend rejected generation: ${detail}`;
}

function generationErrorMessage(parsed) {
  return firstString(parsed?.error_message, parsed?.error);
}

function isLoginFailureMessage(message) {
  return /must be logged|not logged|login required/i.test(message);
}

function generationFailureDetail(message, parsed) {
  const code = generationFailureCode(parsed);
  if (!code) return message;
  return `${message} (code: ${code})`;
}

function generationFailureCode(parsed) {
  return firstString(objectValue(parsed, 'error_code'), objectValue(parsed, 'code'), objectValue(parsed, 'exit_code'));
}

function objectValue(object, key) {
  if (!object) return undefined;
  return object[key];
}

function parseJsonish(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = /\{[\s\S]*\}/.exec(text);
    if (!match) return null;
    return JSON.parse(match[0]);
  }
}

function snippet(text) {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 500);
}

function isGenerationFailure(parsed) {
  return FAILURE_SUCCESS_VALUES.has(parsed.success)
    || Boolean(generationErrorMessage(parsed));
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeImageFilename(value) {
  if (!value) return '';
  const filename = lastPathSegment(imageReferencePath(value));
  return filename || value;
}

function imageReferencePath(value) {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

function lastPathSegment(value) {
  return value.split('/').filter(Boolean).pop();
}

function formatMnemonicHtml(text) {
  return String(text)
    .replace(/[<>]/g, '')
    .replace(/#nl#/g, '<br>')
    .replace(/##([^#]+)##/g, '<b>$1</b>')
    .replace(/#([^#]+)#/g, '<i>$1</i>');
}

function escapeUchisenPrompt(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeImagePrompt(value) {
  let prompt = String(value);
  for (const [pattern, replacement] of IMAGE_PROMPT_REPLACEMENTS) {
    prompt = prompt.replace(pattern, replacement);
  }
  prompt = prompt
    .replace(/no text,\s*letters,\s*numbers,\s*logos,\s*or signage/gi, 'no text or signage')
    .replace(/no text,\s*letters,\s*numbers,\s*logos,\s*labels,\s*or signage/gi, 'no text or signage')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/no text|without text/i.test(prompt)) prompt = `${prompt}; no text or signage`;
  return prompt;
}

function validateItem(item) {
  const missing = ['kanji', 'kanji_id', 'mnemonic', 'image_prompt'].filter(key => !String(item[key] ?? '').trim());
  if (missing.length) throw new Error(`Missing required fields: ${missing.join(', ')}`);
}

async function readQueue(file) {
  const text = await fs.readFile(file, 'utf8');
  if (file.endsWith('.jsonl')) return text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : parsed.items;
}

async function readCheckpoint(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return normalizeCheckpoint(parsed);
  } catch {
    return emptyCheckpoint();
  }
}

function normalizeCheckpoint(parsed) {
  return {
    completed: parsed.completed ?? {},
    failed: parsed.failed ?? {},
    dryRuns: parsed.dryRuns ?? {},
  };
}

function emptyCheckpoint() {
  return { completed: {}, failed: {}, dryRuns: {} };
}

async function writeCheckpoint(file, checkpoint) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(checkpoint, null, 2)}\n`);
}

function itemKey(item) {
  return `${item.kanji_id ?? item.kanjiId ?? 'unknown'}:${item.kanji ?? ''}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs(args) {
  const parsed = { live: false, resume: true, retryFailed: false, delayMs: 6000, stopOnError: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const nextIndex = applyParsedArg(parsed, args, i);
    if (nextIndex < 0) throw new Error(`Unknown argument: ${arg}`);
    i = nextIndex;
  }
  return parsed;
}

function applyParsedArg(parsed, args, index) {
  const arg = args[index];
  const booleanHandler = BOOLEAN_ARG_HANDLERS.get(arg);
  if (booleanHandler) {
    booleanHandler(parsed);
    return index;
  }
  const valueHandler = VALUE_ARG_HANDLERS.get(arg);
  if (!valueHandler) return -1;
  valueHandler(parsed, args[index + 1]);
  return index + 1;
}
