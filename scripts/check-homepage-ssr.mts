import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMarkdownRenderer } from 'vitepress';
import { parse } from '@vue/compiler-dom';
import { installReviewedDocsMarkdownLocales } from '../docs/.vitepress/locales/markdown-localization';

const source = readFileSync(new URL('../docs/index.md', import.meta.url), 'utf8')
    .replace(/^---[\s\S]*?---/, '');
const markdown = await createMarkdownRenderer(process.cwd());
markdown.use(installReviewedDocsMarkdownLocales);
for (const [relativePath, heading] of [
    ['index.md', 'Read Japanese. Stay with the story.'],
    ['ja/index.md', '日本語を読む。物語の続きを楽しむ。'],
]) {
    const html = markdown.render(source, { relativePath });
    // The same parser used by the Vue build catches unbalanced HTML caused by
    // Markdown block boundaries; parsing the entire source as HTML cannot.
    assert.doesNotThrow(() => parse(html), `${relativePath}: invalid Vue template`);
    assert.ok(html.includes(`>${heading}</h1>`), `${relativePath}: missing stable heading`);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.equal((html.match(/<main\b/g) ?? []).length, 1);
    assert.equal((html.match(/data-token-start=/g) ?? []).length, 6);
}
console.log('Homepage SSR passed: EN and JA.');
