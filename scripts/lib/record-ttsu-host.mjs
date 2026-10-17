// Recording side of reader.ttsu.app (ッツ Ebook Reader, BSD-3-Clause): a paged
// reader that lays a book out in CSS columns. The book is the public-domain
// 『こころ』 from the aozora-kokoro recording, given to the app as plain text
// the way a learner adds a file; the writing mode is set in its own Settings.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadRecording } from './recorded-page.mjs';

const ORIGIN = 'https://reader.ttsu.app';
const BOOK_CHARACTERS = 20_000;

export async function prepareTtsuBook(page, { writingMode }) {
    if (writingMode === 'horizontal') {
        await page.goto(`${ORIGIN}/settings`, { waitUntil: 'networkidle' });
        await page.getByText('Horizontal', { exact: true }).click();
        await page.waitForTimeout(500);
    }
    await page.goto(`${ORIGIN}/manage`, { waitUntil: 'networkidle' });
    await page.locator('input[type=file][accept*="epub"]').first().setInputFiles(kokoroTextFile());
    await page.getByText('こころ', { exact: true }).first().click({ timeout: 15_000 });
    await page.waitForURL(`${ORIGIN}/b?id=1`, { timeout: 15_000 });
    await page.locator('.book-content-container').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(3000);
}

function kokoroTextFile() {
    const html = loadRecording('aozora-kokoro').documentHtml();
    const main = /<div class="main_text">([\s\S]*?)<div class="bibliographical_information">/u.exec(html)?.[1];
    if (!main) throw new Error('Record aozora-kokoro first: its text is the book.');
    const text = main
        .replace(/<rt>[\s\S]*?<\/rt>|<rp>[\s\S]*?<\/rp>/gu, '')
        .replace(/<br\s*\/?>/gu, '\n')
        .replace(/<[^>]+>/gu, '')
        .replace(/&nbsp;/gu, ' ')
        .slice(0, BOOK_CHARACTERS);
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'yomu-ttsu-')), 'こころ.txt');
    writeFileSync(file, text);
    return file;
}
