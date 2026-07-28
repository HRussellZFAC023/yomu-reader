#!/usr/bin/env node
// Renders backlog.md as a board you can actually read.
//
// The backlog is 2,900+ lines of prose and nobody can hold it in their head, so
// this parses it into tickets and writes a self-contained HTML page. It is a
// GENERATOR rather than a hand-written page on purpose: the board is regenerated
// from the markdown, so the markdown stays the single source of truth and the
// board cannot drift from it.
//
//   node scripts/backlog-board.mjs            -> writes backlog-board.html
//   node scripts/backlog-board.mjs --out FILE
//
// Visual system is the project's own living paper (docs/academy/VISUAL-SYSTEM.md):
// warm charcoal ink, #f1ead9 paper, asymmetric corners, zero-blur offset shadows,
// pencil-grey secondary copy, accent from the Yomu green. Severity colour is
// deliberately separate from the accent so status reads at a glance.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv.indexOf('--out');
const outPath = outArg > -1 ? process.argv[outArg + 1] : resolve(root, 'backlog-board.html');

// Blocked status is DECLARED, never guessed. Write `BLOCKED BY: <reason>` in a
// ticket to mark it held, or `BLOCKS: <what>` to mark it the thing others wait on.
//
// Inference was tried and abandoned. Prose about a codebase says "blocks" for
// reasons that have nothing to do with project dependencies: "the ruby markup
// blocks the lookup path" is a mechanism, "non-blocking" is the opposite of a
// block, and "blocked cross-origin uploads" is a browser behaviour. All three were
// read as held work. A wrong blocker list is worse than no blocker list, because
// it hides the real ones — the 401 that two threads are waiting on was buried
// among four false positives.
const BLOCKED_BY_RE = /BLOCKED BY:\s*([\s\S]+)$/;
const BLOCKS_RE = /BLOCKS:\s*([\s\S]+)$/;

const STATUS_LABEL = { open: 'Open', done: 'Done', part: 'Part done', stale: 'Stale', blocked: 'Blocked', blocker: 'Blocking others' };

const source = readFileSync(resolve(root, 'backlog.md'), 'utf8');
const { epics, meta } = parseBacklog(source);
writeFileSync(outPath, renderBoard(epics, meta));
const counts = tally(epics);
process.stdout.write(
    `backlog board -> ${outPath}\n`
    + `  epics ${epics.length} · tickets ${counts.total}`
    + `  (open ${counts.open}, done/part ${counts.shipped}, blocked ${counts.blocked}, blocking ${counts.blocker}, stale ${counts.stale})\n`,
);

function parseBacklog(text) {
    const lines = text.split('\n');
    const epics = [];
    let epic;
    let ticket;
    let archived = false;

    for (const line of lines) {
        // Everything past the ARCHIVE divider is the pre-reconciliation document,
        // kept verbatim for history. It is not live work, so it is not a board.
        if (/^#+\s.*ARCHIVE/i.test(line)) archived = true;
        if (archived) continue;

        const heading = line.match(/^(#{1,3})\s+(.+?)\s*$/);
        if (heading) {
            const title = stripInline(heading[2]);
            // Section headings that introduce tickets become epics; the document's
            // own PART banners are structure, not epics.
            if (/^PART\b/i.test(title)) continue;
            epic = { title, note: '', tickets: [] };
            epics.push(epic);
            ticket = undefined;
            continue;
        }

        const item = line.match(/^\s*-\s*\[( |x|X)\]\s*(.*)$/);
        if (item && epic) {
            const done = item[1].toLowerCase() === 'x';
            const body = item[2];
            const id = body.match(/^\*\*([A-Za-z0-9.\-/]+)\s*[—–-]\s*/);
            ticket = {
                id: id ? id[1] : '',
                text: stripInline(body),
                done,
            };
            epic.tickets.push(ticket);
            continue;
        }

        // Continuation lines belong to the ticket above them.
        if (ticket && /^\s{4,}\S/.test(line)) {
            ticket.text += ` ${stripInline(line)}`;
            continue;
        }
        if (epic && !epic.tickets.length && line.trim() && !line.startsWith('|') && !line.startsWith('>')) {
            epic.note += `${epic.note ? ' ' : ''}${stripInline(line)}`;
        }
    }

    for (const entry of epics) {
        for (const item of entry.tickets) {
            item.status = statusOf(item);
            item.blockReason = item.status === 'blocked' || item.status === 'blocker' ? blockReasonOf(item) : '';
            item.severity = severityOf(entry, item);
            item.title = titleOf(item);
            item.detail = detailOf(item);
        }
    }

    const version = source.match(/@\s*`?([0-9a-f]{7,})`?\s*\(([\d.]+)\)/);
    return {
        epics: epics.filter(entry => entry.tickets.length),
        meta: {
            reconciled: (source.match(/\*\*Reconciled\s+([\d-]+)/) || [])[1] ?? '',
            version: version ? version[2] : '',
        },
    };
}

/**
 * Status, in the order that a wrong answer costs the most.
 *
 * The distinction the first version of this missed: a ticket that BLOCKS other
 * work is not itself blocked. `A5` ("the 401 blocks both threads") is the thing
 * everyone is waiting on and should be near the top of the list; treating it as
 * "blocked" buried it. The two now read as `blocker` and `blocked`.
 *
 * It also matched the word inside `non-blocking`, which is how a ruling that
 * licensing is settled came out as blocked work.
 */
function statusOf(item) {
    if (item.done) return 'done';
    const text = item.text;
    // "is STALE" / "STALE:" marks THIS ticket. A ticket that merely says another
    // entry is stale (A16 reporting on D37) is not itself stale — that mislabelled
    // two live tickets as dead ones.
    if (/^STALE\b/.test(text) || /\bTHIS IS STALE\b/i.test(text)) return 'stale';
    if (/\bNOT DONE\b/.test(text) || /\bhalf done\b/i.test(text)) return 'part';
    if (BLOCKED_BY_RE.test(text)) return 'blocked';
    if (BLOCKS_RE.test(text)) return 'blocker';
    if (/\b(?:DONE|SHIPPED)\b/.test(text)) return 'part';
    return 'open';
}

/**
 * Why a ticket cannot move. Prefers the explicit marker; otherwise lifts the
 * clause that carries the blocking language, so the card says something true
 * rather than "blocked" with no reason a reader can act on.
 */
function blockReasonOf(item) {
    const held = item.text.match(BLOCKED_BY_RE);
    if (held) return tidy(held[1]);
    const holds = item.text.match(BLOCKS_RE);
    return holds ? tidy(holds[1]) : '';
}

function tidy(value) {
    const core = value.replace(/\s+/g, ' ').trim();
    return core.length > 300 ? `${core.slice(0, 297)}…` : core;
}

// Severity is about consequence, not effort: things that are wrong for a real
// user outrank things that are merely unfinished.
function severityOf(epic, item) {
    if (item.status === 'blocker') return 'critical';
    const text = `${epic.title} ${item.text}`;
    if (/most time-critical|cannot be run server-side|blocks every release|blocks both|privacy|401/i.test(text)) return 'critical';
    if (/\bbug\b|does not|do not look up|not saving|does not close|silently|broken|regress/i.test(text)) return 'high';
    if (/owner|USER RULE|verbatim/i.test(text)) return 'high';
    return 'normal';
}

function titleOf(item) {
    const withoutId = item.id ? item.text.replace(new RegExp(`^${escapeRe(item.id)}\\s*[—–-]\\s*`), '') : item.text;
    const firstSentence = withoutId.match(/^(.{0,150}?[.!?])(\s|$)/);
    return (firstSentence ? firstSentence[1] : withoutId).trim();
}

function detailOf(item) {
    const title = titleOf(item);
    const index = item.text.indexOf(title);
    const rest = index > -1 ? item.text.slice(index + title.length) : '';
    return rest.trim();
}

function stripInline(value) {
    return value
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeRe(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tally(epics) {
    const all = epics.flatMap(entry => entry.tickets);
    return {
        total: all.length,
        open: all.filter(item => item.status === 'open').length,
        done: all.filter(item => item.status === 'done').length,
        part: all.filter(item => item.status === 'part').length,
        stale: all.filter(item => item.status === 'stale').length,
        blocked: all.filter(item => item.status === 'blocked').length,
        blocker: all.filter(item => item.status === 'blocker').length,
        shipped: all.filter(item => item.status === 'done' || item.status === 'part').length,
        critical: all.filter(item => item.severity === 'critical').length,
    };
}

function esc(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


function renderBoard(epics, meta) {
    const counts = tally(epics);
    return `<title>Yomu backlog</title>
<style>
  :root {
    --ink: #181b18;
    --paper: #f1ead9;
    --paper-2: #e7dec8;
    --folded: #ddd0b7;
    --paper-ink: #29271f;
    --pencil: #655f51;
    --accent: #5ea780;
    --crit: #b5493a;
    --high: #c07a1e;
    --rule: color-mix(in srgb, var(--ink) 18%, transparent);
    --card: #f7f2e6;
    --shadow: color-mix(in srgb, var(--ink) 30%, transparent);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ink: #0f120f;
      --paper: #1b1e1a;
      --paper-2: #23261f;
      --folded: #2c2f26;
      --paper-ink: #ece4d2;
      --pencil: #a49d8b;
      --accent: #79c39b;
      --crit: #e2796a;
      --high: #dda34a;
      --rule: color-mix(in srgb, #ece4d2 16%, transparent);
      --card: #21241d;
      --shadow: #000;
    }
  }
  :root[data-theme="dark"] {
    --ink: #0f120f; --paper: #1b1e1a; --paper-2: #23261f; --folded: #2c2f26;
    --paper-ink: #ece4d2; --pencil: #a49d8b; --accent: #79c39b; --crit: #e2796a;
    --high: #dda34a; --rule: color-mix(in srgb, #ece4d2 16%, transparent);
    --card: #21241d; --shadow: #000;
  }
  :root[data-theme="light"] {
    --ink: #181b18; --paper: #f1ead9; --paper-2: #e7dec8; --folded: #ddd0b7;
    --paper-ink: #29271f; --pencil: #655f51; --accent: #5ea780; --crit: #b5493a;
    --high: #c07a1e; --rule: color-mix(in srgb, #181b18 18%, transparent);
    --card: #f7f2e6; --shadow: color-mix(in srgb, #181b18 30%, transparent);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 34px clamp(16px, 4vw, 52px) 90px;
    background: var(--paper);
    color: var(--paper-ink);
    font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
  }
  .masthead { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 18px 30px; border-bottom: 2px solid var(--rule); padding-bottom: 18px; }
  h1 { margin: 0; font-size: clamp(1.7rem, 4.4vw, 2.5rem); font-weight: 800; letter-spacing: -0.02em; text-wrap: balance; }
  h1 span { color: var(--pencil); font-weight: 500; }
  .stamp { margin: 0; color: var(--pencil); font-size: 0.78rem; letter-spacing: 0.09em; text-transform: uppercase; }
  .totals { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; font-variant-numeric: tabular-nums; }
  .total { border: 2px solid var(--rule); border-radius: 3px 10px 3px 10px; padding: 6px 12px; background: var(--card); }
  .total b { display: block; font-size: 1.25rem; }
  .total span { color: var(--pencil); font-size: 0.72rem; letter-spacing: 0.07em; text-transform: uppercase; }
  .total.is-crit { border-color: var(--crit); }
  .controls { display: flex; flex-wrap: wrap; gap: 10px; margin: 22px 0 8px; }
  .controls input, .controls button {
    min-height: 44px; border: 2px solid var(--rule); border-radius: 3px 9px 3px 9px;
    padding: 8px 14px; background: var(--card); color: inherit; font: inherit; cursor: pointer;
  }
  .controls input { flex: 1 1 240px; cursor: text; }
  .controls button[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--card)); font-weight: 700; }
  .controls :focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .epic { margin-top: 34px; }
  .epic > h2 {
    position: relative; display: inline-block; margin: 0 0 4px;
    font-size: 1.06rem; letter-spacing: 0.02em; text-wrap: balance;
  }
  /* One tape strip per epic header — the living-paper grammar, not decoration
     for its own sake: it marks where a section was posted. */
  .epic > h2::before {
    content: ''; position: absolute; left: -10px; top: -8px; width: 46px; height: 15px;
    background: color-mix(in srgb, var(--accent) 32%, var(--folded)); transform: rotate(-3deg);
  }
  .epic > p { margin: 6px 0 14px; max-width: 68ch; color: var(--pencil); font-size: 0.9rem; }
  .tickets { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
  .ticket {
    position: relative; border: 2px solid var(--rule); border-left: 6px solid var(--pencil);
    border-radius: 3px 13px 4px 11px; padding: 13px 15px 15px; background: var(--card);
    box-shadow: 5px 6px 0 var(--shadow);
  }
  .ticket.sev-critical { border-left-color: var(--crit); }
  .ticket.sev-high { border-left-color: var(--high); }
  .ticket.sev-normal { border-left-color: var(--accent); }
  .ticket header { display: flex; align-items: baseline; gap: 9px; margin-bottom: 6px; }
  .tid { font-size: 0.76rem; font-weight: 800; letter-spacing: 0.05em; font-variant-numeric: tabular-nums; }
  .chip { margin-left: auto; border: 1.5px solid var(--rule); border-radius: 2px 7px 2px 7px; padding: 2px 8px; color: var(--pencil); font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
  .chip.st-done, .chip.st-part { border-color: var(--accent); color: var(--accent); }
  .chip.st-stale, .chip.st-blocked { border-color: var(--crit); color: var(--crit); }
  /* The reason a ticket cannot move is the most actionable line on the card, so
     it sits above the description rather than buried in it. */
  .why { margin: 0 0 8px; border-left: 3px solid var(--crit); padding: 6px 0 6px 10px; color: var(--paper-ink); font-size: 0.83rem; line-height: 1.45; }
  .why span { display: block; color: var(--crit); font-size: 0.66rem; font-weight: 800; letter-spacing: 0.09em; text-transform: uppercase; }
  .chip.st-blocker { border-color: var(--crit); color: var(--crit); }
  .total.is-block { border-color: var(--crit); }
  .ticket h3 { margin: 0 0 7px; font-size: 0.99rem; line-height: 1.35; text-wrap: balance; }
  .ticket p { margin: 0; color: var(--pencil); font-size: 0.855rem; }
  .ticket p.clamped { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
  .ticket button.more { margin-top: 8px; min-height: 32px; border: 0; padding: 0; background: none; color: var(--accent); font: inherit; font-size: 0.8rem; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .empty { margin-top: 30px; color: var(--pencil); }
  [hidden] { display: none !important; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>

<header class="masthead">
  <div>
    <h1>Yomu backlog <span>&mdash; board</span></h1>
    <p class="stamp">Generated from backlog.md${meta.reconciled ? ` &middot; reconciled ${esc(meta.reconciled)}` : ''}${meta.version ? ` &middot; main ${esc(meta.version)}` : ''}</p>
  </div>
  <div class="totals">
    <p class="total"><b>${counts.total}</b><span>Tickets</span></p>
    <p class="total"><b>${counts.open}</b><span>Open</span></p>
    <p class="total"><b>${counts.shipped}</b><span>Done / part</span></p>
    <p class="total is-block"><b>${counts.blocked + counts.blocker}</b><span>Blocked</span></p>
    <p class="total is-crit"><b>${counts.critical}</b><span>Critical</span></p>
  </div>
</header>

<div class="controls">
  <input id="q" type="search" placeholder="Filter by id, word, or epic" aria-label="Filter tickets">
  <button type="button" data-filter="all" aria-pressed="true">All</button>
  <button type="button" data-filter="open" aria-pressed="false">Open</button>
  <button type="button" data-filter="blocked" aria-pressed="false">Blocked \u0026 blocking</button>
  <button type="button" data-filter="done" aria-pressed="false">Done</button>
  <button type="button" data-filter="critical" aria-pressed="false">Critical</button>
  <button type="button" data-filter="bug" aria-pressed="false">Defects</button>
</div>

<main id="board">
${epics.map(epic => `  <section class="epic">
    <h2>${esc(epic.title)}</h2>
${epic.note ? `    <p>${esc(epic.note.slice(0, 320))}</p>\n` : ''}    <div class="tickets">
${epic.tickets.map(ticket => renderTicket(ticket, epic)).join('\n')}
    </div>
  </section>`).join('\n')}
  <p class="empty" id="empty" hidden>Nothing matches that filter.</p>
</main>

<script>
  const board = document.getElementById('board');
  const query = document.getElementById('q');
  const buttons = [...document.querySelectorAll('[data-filter]')];
  let mode = 'all';

  function apply() {
    const needle = query.value.trim().toLowerCase();
    let shown = 0;
    for (const ticket of board.querySelectorAll('.ticket')) {
      const matchesText = !needle || ticket.dataset.search.includes(needle);
      const matchesMode = mode === 'all'
        || (mode === 'open' && ticket.dataset.status === 'open')
        || (mode === 'blocked' && (ticket.dataset.status === 'blocked' || ticket.dataset.status === 'blocker'))
        || (mode === 'done' && (ticket.dataset.status === 'done' || ticket.dataset.status === 'part'))
        || (mode === 'critical' && ticket.dataset.severity === 'critical')
        || (mode === 'bug' && ticket.dataset.severity !== 'normal');
      const show = matchesText && matchesMode;
      ticket.hidden = !show;
      if (show) shown += 1;
    }
    for (const epic of board.querySelectorAll('.epic')) {
      epic.hidden = ![...epic.querySelectorAll('.ticket')].some(t => !t.hidden);
    }
    document.getElementById('empty').hidden = shown > 0;
  }

  query.addEventListener('input', apply);
  for (const button of buttons) {
    button.addEventListener('click', () => {
      mode = button.dataset.filter;
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
      apply();
    });
  }
  board.addEventListener('click', event => {
    const more = event.target.closest('button.more');
    if (!more) return;
    const body = more.previousElementSibling;
    const clamped = body.classList.toggle('clamped');
    more.textContent = clamped ? 'More' : 'Less';
  });
</script>
`;
}

function renderTicket(ticket, epic) {
    const search = esc(`${ticket.id} ${ticket.title} ${ticket.detail} ${epic.title}`.toLowerCase());
    const long = ticket.detail.length > 260;
    return `      <article class="ticket sev-${ticket.severity}" data-status="${ticket.status}" data-severity="${ticket.severity}" data-search="${search}">
        <header>
          ${ticket.id ? `<span class="tid">${esc(ticket.id)}</span>` : ''}
          <span class="chip st-${ticket.status}">${STATUS_LABEL[ticket.status]}</span>
        </header>
        <h3>${esc(ticket.title)}</h3>
${ticket.blockReason ? `        <p class="why"><span>${ticket.status === 'blocker' ? 'Blocks' : 'Blocked by'}</span>${esc(ticket.blockReason)}</p>\n` : ''}
${ticket.detail ? `        <p class="${long ? 'clamped' : ''}">${esc(ticket.detail)}</p>\n${long ? '        <button class="more" type="button">More</button>\n' : ''}` : ''}      </article>`;
}
