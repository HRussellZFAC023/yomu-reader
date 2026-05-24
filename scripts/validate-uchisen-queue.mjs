#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/validate-uchisen-queue.mjs queue.jsonl');
  process.exit(1);
}

const queuePath = path.resolve(input);
const text = await fs.readFile(queuePath, 'utf8');
const lines = text.split(/\r?\n/).filter(Boolean);
const errors = [];
const seen = new Set();

for (let index = 0; index < lines.length; index += 1) {
  const lineNumber = index + 1;
  let item;
  try {
    item = JSON.parse(lines[index]);
  } catch (error) {
    errors.push(`${lineNumber}: invalid JSON: ${error.message}`);
    continue;
  }

  const label = `${lineNumber} ${item.kanji ?? '(missing kanji)'}`;
  for (const field of ['kanji', 'keyword', 'kanji_id', 'mnemonic', 'image_prompt']) {
    if (!String(item[field] ?? '').trim()) errors.push(`${label}: missing ${field}`);
  }
  if (!Array.isArray(item.components)) errors.push(`${label}: components must be an array`);

  const key = `${item.kanji_id}:${item.kanji}`;
  if (seen.has(key)) errors.push(`${label}: duplicate key ${key}`);
  seen.add(key);

  const keyword = String(item.keyword ?? '');
  const mnemonic = String(item.mnemonic ?? '');
  const imagePrompt = String(item.image_prompt ?? '');
  const keywordMarker = `##${keyword}##`;
  if (countOccurrences(mnemonic, keywordMarker) !== 1) errors.push(`${label}: mnemonic must contain ${keywordMarker} exactly once`);
  if ((mnemonic.match(/##/g) ?? []).length !== 2) errors.push(`${label}: mnemonic has extra keyword marker delimiters`);
  if (sentenceCount(mnemonic) > 3) errors.push(`${label}: mnemonic has more than 3 sentences`);

  for (const component of item.components ?? []) {
    const marker = `#${component}#`;
    if (!mnemonic.includes(marker)) errors.push(`${label}: mnemonic missing component marker ${marker}`);
  }

  if (!imagePrompt.startsWith("Japanese children's storybook illustration of ")) {
    errors.push(`${label}: image_prompt must start with required phrase`);
  }
  for (const required of ['pastel colors, vintage textures', 'warm light', 'clear silhouettes']) {
    if (!imagePrompt.includes(required)) errors.push(`${label}: image_prompt missing ${required}`);
  }
  if (!/no text|without text/i.test(imagePrompt)) errors.push(`${label}: image_prompt must forbid text`);
  if (/1970s/i.test(`${mnemonic}\n${imagePrompt}`)) errors.push(`${label}: contains 1970s`);
  if (/[“”]/.test(`${mnemonic}\n${imagePrompt}`)) errors.push(`${label}: use straight quotes only`);
}

if (errors.length) {
  console.error(`Uchisen queue validation failed: ${errors.length} issue(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${lines.length} Uchisen queue item(s): ${queuePath}`);

function countOccurrences(text, needle) {
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

function sentenceCount(text) {
  return text
    .replace(/##[^#]+##/g, 'KEYWORD')
    .split(/[.!?。]+/)
    .map(part => part.trim())
    .filter(Boolean).length;
}
