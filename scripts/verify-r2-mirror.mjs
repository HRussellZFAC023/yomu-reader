import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [sourcePath, backupPath] = process.argv.slice(2);
if (!sourcePath || !backupPath) {
  throw new Error('Usage: node scripts/verify-r2-mirror.mjs <source.json> <backup.json>');
}

const readInventory = async (filePath) => {
  const payload = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(payload.IsTruncated, false, `${filePath} inventory was truncated`);
  return new Map((payload.Contents ?? []).map(object => [
    object.Key,
    { size: object.Size },
  ]));
};

const source = await readInventory(sourcePath);
const backup = await readInventory(backupPath);

for (const [key, expected] of source) {
  assert.deepEqual(backup.get(key), expected, `R2 backup differs for ${key}`);
}

const totalBytes = [...source.values()].reduce((sum, object) => sum + object.size, 0);
console.log(`R2 mirror verified: ${source.size} source objects, ${totalBytes} source bytes, all present in backup.`);
