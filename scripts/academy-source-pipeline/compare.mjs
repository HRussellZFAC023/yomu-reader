import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { insideRoot } from './paths.mjs';
import { writeFileAtomic } from './io.mjs';

/**
 * Private teacher/editor comparison surface: for every migrated pack, the real
 * PDF page renders sit next to the migrated source candidates, augmentation,
 * and review state. Everything is WRITTEN inside the private artifact root and
 * nothing here is published.
 */
export function generateTeacherComparison(roots, packCandidates, { packWorkspacesRoot } = {}) {
    const compareRoot = insideRoot(roots.privateRoot, 'teacher-comparison');
    const censusRoot = insideRoot(roots.privateRoot, 'pdf-census');
    mkdirSync(compareRoot, { recursive: true });
    for (const pack of packCandidates.packs) {
        const html = renderPackPage(pack, {
            censusRoot,
            compareRoot,
            privateRoot: roots.privateRoot,
            packWorkspacesRoot,
        });
        writeFileAtomic(insideRoot(compareRoot, `${sanitizeId(pack.packId)}.html`), html);
    }
    writeFileAtomic(insideRoot(compareRoot, 'index.html'), renderIndex(packCandidates));
    return compareRoot;
}

function renderIndex(packCandidates) {
    const rows = packCandidates.packs.map(pack => `
    <tr>
      <td><a href="${sanitizeId(pack.packId)}.html">${escapeHtml(pack.packId)}</a></td>
      <td>${escapeHtml(pack.slug ?? '')}</td>
      <td>${pack.counts.donorItemCount}</td>
      <td>${pack.counts.unresolvedLocusCount}</td>
      <td>${pack.sourceDocument.inMoodleCorpus ? 'moodle corpus' : 'local library only'}</td>
    </tr>`).join('\n');
    return `<!doctype html>
<meta charset="utf-8">
<title>Teacher comparison — migrated packs</title>
<style>body{font:14px system-ui;margin:1rem}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:.3rem .6rem}</style>
<h1>Migrated pack candidates (${packCandidates.totals.packCount})</h1>
<p>All items are machine-migrated candidates. Nothing on this surface is a verified source question.</p>
<table><tr><th>Pack</th><th>Slug</th><th>Items</th><th>Unresolved loci</th><th>Source</th></tr>${rows}</table>
`;
}

function renderPackPage(pack, { censusRoot, compareRoot, privateRoot, packWorkspacesRoot }) {
    const pages = findPageRenders(pack, { censusRoot, compareRoot, packWorkspacesRoot });
    const censusIndex = insideRoot(censusRoot, pack.sourceDocument.sha256, 'index.html');
    const overlayLink = existsSync(censusIndex)
        ? `<a href="${escapeHtml(relativePrivateUrl(censusIndex, compareRoot, privateRoot))}">Open page/object/media overlay census</a>`
        : 'Overlay census unavailable';
    const pageColumn = pages.length
        ? pages.map(page => `<figure><img loading="lazy" src="${escapeHtml(relativePrivateUrl(page.path, compareRoot, privateRoot))}" alt="Source page render"><figcaption>${escapeHtml(page.label)}</figcaption></figure>`).join('\n')
        : '<p class="warn">No page render available — census this document before review.</p>';
    const items = pack.sourceCandidates.map((candidate, index) => {
        const augmentation = pack.augmentation[index];
        return `
    <details open>
      <summary>${escapeHtml(candidate.itemId)} — ${escapeHtml(candidate.reviewState)}</summary>
      <p><strong>Source candidate (immutable):</strong> ${escapeHtml(candidate.promptOriginal ?? '(no prompt text)')}</p>
      <p>Locus: page ${candidate.locus.page ?? '?'} — ${escapeHtml(candidate.locus.status)}</p>
      ${candidate.mediaDescriptions.length ? `<p>Media (described, not verified): ${escapeHtml(candidate.mediaDescriptions.map(entry => `${entry.kind}:${JSON.stringify(entry.ref)}`).join('; '))}</p>` : ''}
      <p><strong>Augmentation:</strong> ${escapeHtml(augmentation?.promptTranslation ?? '(none)')}${augmentation?.answer ? ` — answer ${escapeHtml(augmentation.answer.status ?? 'unknown')} (${escapeHtml(augmentation.answer.provenance)})` : ''}</p>
    </details>`;
    }).join('\n');
    return `<!doctype html>
<meta charset="utf-8">
<title>${escapeHtml(pack.packId)} — source vs migrated</title>
<style>body{font:14px system-ui;margin:1rem;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1rem}body>*{min-width:0}img{max-width:100%;border:1px solid #999}.warn{color:#a00}header{grid-column:1/-1}header p,details{overflow-wrap:anywhere}@media(max-width:800px){body{grid-template-columns:minmax(0,1fr)}header{grid-column:1}}</style>
<header>
  <h1>${escapeHtml(pack.slug ?? pack.packId)}</h1>
  <p>Document sha256 ${escapeHtml(pack.sourceDocument.sha256)} — rights: ${escapeHtml(pack.sourceDocument.rights)} — ${pack.sourceDocument.inMoodleCorpus ? 'present in Moodle corpus' : 'local library only'} — ${overlayLink}</p>
</header>
<section><h2>Source pages</h2>${pageColumn}</section>
<section><h2>Migrated candidates (${pack.counts.donorItemCount})</h2>${items}</section>
`;
}

function findPageRenders(pack, { censusRoot, compareRoot, packWorkspacesRoot }) {
    const pages = [];
    const censusPages = insideRoot(censusRoot, pack.sourceDocument.sha256, 'pages');
    const pageCount = pack.sourceDocument.pageCount ?? 0;
    const width = String(Math.max(pageCount, 1)).length;
    for (let page = 1; page <= pageCount; page += 1) {
        const censusRender = path.join(censusPages, `page-${String(page).padStart(width, '0')}.png`);
        const workspaceRender = packWorkspacesRoot
            ? path.join(packWorkspacesRoot, pack.packId, 'pages', `page-${page}.png`)
            : null;
        if (existsSync(censusRender)) {
            pages.push({ path: censusRender, label: `Page ${page} (census render, 200 DPI)` });
        } else if (workspaceRender && existsSync(workspaceRender)) {
            const copiedRender = insideRoot(
                compareRoot,
                'source-renders',
                sanitizeId(pack.packId),
                `page-${String(page).padStart(width, '0')}.png`,
            );
            mkdirSync(path.dirname(copiedRender), { recursive: true });
            copyFileSync(workspaceRender, copiedRender);
            pages.push({ path: copiedRender, label: `Page ${page} (donor workspace render)` });
        }
    }
    return pages;
}

function relativePrivateUrl(target, fromRoot, privateRoot) {
    const relative = path.relative(fromRoot, target);
    const privateRelative = path.relative(privateRoot, target);
    const insidePrivateRoot = privateRelative === ''
        || (!privateRelative.startsWith('..') && !path.isAbsolute(privateRelative));
    if (!insidePrivateRoot) throw new Error(`Teacher comparison asset escapes its private root: ${target}`);
    return relative.split(path.sep).join('/');
}

function sanitizeId(value) {
    if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(value)) throw new Error(`Unsafe pack id for filesystem output: ${value}`);
    return value;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
}
