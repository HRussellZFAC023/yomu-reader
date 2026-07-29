import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/cloudflare-data-backup.yml', 'utf8');
const recovery = readFileSync('docs/operations/cloudflare-data-recovery.md', 'utf8');

describe('Cloudflare durability backup', () => {
  it('schedules remote exports for both money-bearing databases', () => {
    expect(workflow).toContain('schedule:');
    expect(workflow).toContain('for database in yomu-support yomu-academy');
    expect(workflow).toMatch(/d1 export "\$\{database\}"[\s\S]*?--remote/);
    expect(workflow).toMatch(/r2 object put[\s\S]*?--remote/g);
    expect(workflow).toContain('order-d1-restore-data.mjs');
  });

  it('mirrors dictionaries without propagating deletions', () => {
    expect(workflow).toContain('s3://yomu-dictionaries/');
    expect(workflow).toContain('s3://yomu-dictionaries-backup/');
    expect(workflow).not.toContain('--delete');
    expect(workflow).toContain('verify-r2-mirror.mjs');
  });

  it('documents remote restore paths and Time Travel limits', () => {
    expect(recovery).toMatch(/Restore `yomu-support`[\s\S]*?--remote/);
    expect(recovery).toMatch(/Restore `yomu-academy`[\s\S]*?--remote/);
    expect(recovery).toMatch(/Restore `yomu-dictionaries`[\s\S]*?verify-r2-mirror/);
    expect(recovery).toContain('after that database or the Cloudflare account is deleted');
  });
});
