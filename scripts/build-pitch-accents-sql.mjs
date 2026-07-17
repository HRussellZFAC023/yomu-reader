#!/usr/bin/env node
/**
 * Build the yomu-audio worker's pitch_accents D1 seed from the Kanjium
 * pitch-accent dictionary (same data the reader's local-parsing onboarding
 * downloads).
 *
 *   node scripts/build-pitch-accents-sql.mjs [kanjium_pitch_accents.zip] [--self-test]
 *
 * Converts every (expression, reading, accent) into an `x-amazon-pron-kana`
 * ph string (katakana morae, apostrophe after the accented mora — the
 * alphabet AWS Polly uses for pitch-aware synthesis) and writes
 * workers/yomu-audio/data/pitch_accents.sql for D1 import.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "workers", "yomu-audio", "data");
const outSql = join(outDir, "pitch_accents.sql");
const KANJIUM_URL = "https://raw.githubusercontent.com/FooSoft/yomichan/dictionaries/kanjium_pitch_accents.zip";
const SEP = "\u001f";

const SMALL_KANA = new Set([..."ャュョァィゥェォヮゃゅょぁぃぅぇぉゎ"]);

function toKatakana(text) {
  return [...text].map((ch) => {
    const code = ch.codePointAt(0);
    return code >= 0x3041 && code <= 0x3096 ? String.fromCodePoint(code + 0x60) : ch;
  }).join("");
}

/** Split katakana into morae: small kana attach to the previous mora. */
export function morae(katakana) {
  const units = [];
  for (const ch of katakana) {
    if (SMALL_KANA.has(ch) && units.length) units[units.length - 1] += ch;
    else units.push(ch);
  }
  return units;
}

/** Accent 0 (heiban) → plain katakana; accent N → apostrophe after mora N. */
export function pronKana(reading, accent) {
  const units = morae(toKatakana(reading));
  const position = Number(accent);
  if (!Number.isInteger(position) || position <= 0 || position > units.length) return units.join("");
  return units.slice(0, position).join("") + "'" + units.slice(position).join("");
}

function selfTest() {
  const cases = [
    ["はし", 1, "ハ'シ"],
    ["はし", 2, "ハシ'"],
    ["はし", 0, "ハシ"],
    ["きょう", 1, "キョ'ウ"],
    ["がっこう", 0, "ガッコウ"],
    ["じてんしゃ", 2, "ジテ'ンシャ"],
  ];
  let failed = 0;
  for (const [reading, accent, expected] of cases) {
    const actual = pronKana(reading, accent);
    if (actual !== expected) { failed += 1; console.error(`FAIL ${reading}/${accent}: got ${actual}, want ${expected}`); }
  }
  console.log(failed === 0 ? `self-test OK (${cases.length} cases)` : `self-test FAILED (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}

function loadKanjiumRows(zipPath) {
  const tmp = join(outDir, ".kanjium-extract");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", tmp]);
  const rows = [];
  for (let bank = 1; ; bank += 1) {
    const file = join(tmp, `term_meta_bank_${bank}.json`);
    if (!existsSync(file)) break;
    for (const entry of JSON.parse(readFileSync(file, "utf8"))) {
      const [expression, kind, data] = entry;
      if (kind !== "pitch" || !data?.pitches) continue;
      for (const pitchEntry of data.pitches) {
        rows.push({ expression, reading: data.reading ?? expression, position: pitchEntry.position });
      }
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  return rows;
}

function main() {
  if (process.argv.includes("--self-test")) selfTest();
  mkdirSync(outDir, { recursive: true });
  let zipPath = process.argv[2];
  if (!zipPath) {
    zipPath = join(outDir, "kanjium_pitch_accents.zip");
    if (!existsSync(zipPath)) {
      console.log(`downloading ${KANJIUM_URL}`);
      execFileSync("curl", ["-sL", "-o", zipPath, KANJIUM_URL]);
    }
  }
  const rows = loadKanjiumRows(zipPath);
  console.log(`kanjium rows: ${rows.length}`);
  const seen = new Map();
  for (const row of rows) {
    const ph = pronKana(row.reading, row.position);
    if (!ph) continue;
    const key = [row.expression, row.reading, ph].join(SEP);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const esc = (value) => value.replaceAll("'", "''");
  const lines = ["DELETE FROM pitch_accents;"];
  const entries = [...seen.entries()];
  for (let index = 0; index < entries.length; index += 500) {
    const chunk = entries.slice(index, index + 500).map(([key, count]) => {
      const [expression, reading, ph] = key.split(SEP);
      return `('${esc(expression)}','${esc(reading)}','${esc(ph)}',${count})`;
    });
    lines.push(`INSERT INTO pitch_accents (expression, reading, pitch, count) VALUES\n${chunk.join(",\n")};`);
  }
  writeFileSync(outSql, lines.join("\n") + "\n");
  console.log(`wrote ${outSql} (${entries.length} unique pitch rows)`);
}

main();
