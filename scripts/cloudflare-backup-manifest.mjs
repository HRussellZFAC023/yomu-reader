import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const backupDirectory = process.env.BACKUP_DIR;
const createdAt = process.env.BACKUP_STAMP;
const commit = process.env.BACKUP_COMMIT;

if (!backupDirectory || !createdAt || !commit) {
  throw new Error('BACKUP_DIR, BACKUP_STAMP and BACKUP_COMMIT are required.');
}

const databaseNames = ['yomu-support', 'yomu-academy'];
const databases = [];

for (const name of databaseNames) {
  const files = [];
  for (const part of ['schema', 'data']) {
    const filename = `${name}.${part}.sql.gz`;
    const bytes = await readFile(path.join(backupDirectory, filename));
    files.push({
      part,
      objectKey: `d1/${createdAt}/${filename}`,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  databases.push({ name, files });
}

await writeFile(
  path.join(backupDirectory, 'manifest.json'),
  `${JSON.stringify({
    formatVersion: 1,
    createdAt,
    commit,
    databases,
  }, null, 2)}\n`,
);
