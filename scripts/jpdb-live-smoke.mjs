#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { loadLocalEnv } from './qa-env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
loadLocalEnv(ROOT);

const token = process.env.YOMU_TEST_API_KEY?.trim() || process.env.YOMU_PROFILE_API_KEY?.trim() || '';
if (!token) {
    console.error('JPDB live smoke needs YOMU_TEST_API_KEY or YOMU_PROFILE_API_KEY in the environment or local .env.');
    process.exit(1);
}

const response = await fetch('https://jpdb.io/api/v1/parse', {
    method: 'POST',
    headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    },
    body: JSON.stringify({
        text: ['今日は静かな喫茶店で本を読みました。'],
        position_length_encoding: 'utf16',
        token_fields: ['vocabulary_index', 'position', 'length', 'furigana'],
        vocabulary_fields: ['vid', 'sid', 'rid', 'spelling', 'reading', 'frequency_rank', 'part_of_speech', 'meanings_chunks', 'meanings_part_of_speech', 'card_state', 'pitch_accent'],
    }),
});

const text = await response.text();
if (!response.ok) {
    console.error(`JPDB live smoke failed with status ${response.status}.`);
    process.exit(1);
}

const json = JSON.parse(text);
const vocabulary = Array.isArray(json.vocabulary) ? json.vocabulary.length : 0;
const tokenCount = Array.isArray(json.tokens) ? json.tokens.flat().length : 0;
if (!vocabulary || !tokenCount) {
    console.error(`JPDB live smoke returned an unexpected payload: vocabulary=${vocabulary}, tokens=${tokenCount}.`);
    process.exit(1);
}

console.log(`JPDB live smoke passed: ${vocabulary} vocabulary items, ${tokenCount} tokens.`);
