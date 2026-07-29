import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('D1 restore data ordering', () => {
  it('places referenced rows before dependent rows without changing values', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'yomu-d1-restore-'));
    const schemaPath = path.join(directory, 'schema.sql');
    const dataPath = path.join(directory, 'data.sql');
    const outputPath = path.join(directory, 'ordered.sql');
    writeFileSync(schemaPath, `
      CREATE TABLE invites (id TEXT PRIMARY KEY, class_id TEXT REFERENCES classes(id));
      CREATE TABLE classes (id TEXT PRIMARY KEY);
    `);
    writeFileSync(dataPath, `
      PRAGMA defer_foreign_keys=TRUE;
      INSERT INTO "invites" ("id","class_id") VALUES('invite;1','class-1');
      INSERT INTO "classes" ("id") VALUES('class-1');
    `);

    execFileSync(process.execPath, [
      'scripts/order-d1-restore-data.mjs',
      schemaPath,
      dataPath,
      outputPath,
    ]);
    const ordered = readFileSync(outputPath, 'utf8');

    expect(ordered.indexOf('INSERT INTO "classes"')).toBeLessThan(
      ordered.indexOf('INSERT INTO "invites"'),
    );
    expect(ordered).toContain("'invite;1'");
  });
});
