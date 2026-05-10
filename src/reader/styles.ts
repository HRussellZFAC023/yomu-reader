export const READER_CSS = `
:root {
  --jpdb-reader-bg: #181b20;
  --jpdb-reader-surface: #20242b;
  --jpdb-reader-surface-2: #282e37;
  --jpdb-reader-text: #f2f4f8;
  --jpdb-reader-muted: #aab2c0;
  --jpdb-reader-faint: #6f7a89;
  --jpdb-reader-border: rgba(255,255,255,.12);
  --jpdb-reader-accent: #5ea780;
  --jpdb-reader-accent-soft: rgba(94,167,128,.18);
  --jpdb-reader-hover: rgba(255,255,255,.08);
}

@media (prefers-color-scheme: light) {
  :root {
    --jpdb-reader-bg: #ffffff;
    --jpdb-reader-surface: #f7f8fa;
    --jpdb-reader-surface-2: #eef1f4;
    --jpdb-reader-text: #171a1f;
    --jpdb-reader-muted: #596272;
    --jpdb-reader-faint: #7b8493;
    --jpdb-reader-border: rgba(20,30,45,.16);
    --jpdb-reader-hover: rgba(20,30,45,.07);
  }
}

.jpdb-reader-theme-dark {
  --jpdb-reader-bg: #181b20;
  --jpdb-reader-surface: #20242b;
  --jpdb-reader-surface-2: #282e37;
  --jpdb-reader-text: #f2f4f8;
  --jpdb-reader-muted: #aab2c0;
  --jpdb-reader-faint: #6f7a89;
  --jpdb-reader-border: rgba(255,255,255,.12);
  --jpdb-reader-hover: rgba(255,255,255,.08);
}

.jpdb-reader-theme-light {
  --jpdb-reader-bg: #ffffff;
  --jpdb-reader-surface: #f7f8fa;
  --jpdb-reader-surface-2: #eef1f4;
  --jpdb-reader-text: #171a1f;
  --jpdb-reader-muted: #596272;
  --jpdb-reader-faint: #7b8493;
  --jpdb-reader-border: rgba(20,30,45,.16);
  --jpdb-reader-hover: rgba(20,30,45,.07);
}

[data-jpdb-reader-root],
[data-jpdb-reader-root] * {
  box-sizing: border-box;
}
[data-jpdb-reader-root] button,
[data-jpdb-reader-root] input,
[data-jpdb-reader-root] select,
[data-jpdb-reader-root] textarea {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
  text-transform: none;
}

.jpdb-reader-word {
  position: relative;
  border-radius: 3px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  text-decoration-line: underline;
  text-decoration-style: solid;
  text-decoration-color: transparent;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  transition: background .12s ease, text-decoration-color .12s ease;
}

.jpdb-reader-word:hover,
.jpdb-reader-word:focus {
  background: var(--jpdb-reader-hover);
  outline: none;
}

.jpdb-reader-word.jpdb-new { background: rgba(75,141,255,.14); text-decoration-color: #4b8dff; }
.jpdb-reader-word.jpdb-learning { background: rgba(94,167,128,.14); text-decoration-color: #5ea780; }
.jpdb-reader-word.jpdb-known { background: transparent; text-decoration-color: #70c000; }
.jpdb-reader-word.jpdb-due { background: rgba(255,165,0,.14); text-decoration-color: #ffa500; }
.jpdb-reader-word.jpdb-failed { background: rgba(255,69,0,.14); text-decoration-color: #ff4500; }
.jpdb-reader-word.jpdb-locked { opacity: .72; text-decoration-color: #777; }
.jpdb-reader-word.jpdb-never-forget { background: rgba(94,167,128,.12); text-decoration-color: #70c000; }
.jpdb-reader-word.jpdb-blacklisted { opacity: .45; text-decoration-color: #555; }
.jpdb-reader-word.jpdb-suspended { opacity: .58; text-decoration-color: #999; }
.jpdb-reader-word.jpdb-redundant { text-decoration-color: #70c000; }
.jpdb-reader-word.jpdb-not-in-deck { text-decoration-color: rgba(127,137,152,.55); }
.jpdb-reader-furi { font-size: .55em; color: var(--jpdb-reader-muted); line-height: 1; user-select: none; }
.jpdb-reader-word ruby {
  position: relative;
  display: inline-block;
  line-height: inherit;
}
.jpdb-reader-word rp { display: none; }
.jpdb-reader-word rt.jpdb-reader-furi {
  position: absolute;
  left: 50%;
  bottom: 100%;
  transform: translateX(-50%);
  white-space: nowrap;
  pointer-events: none;
}
.jpdb-reader-hide-known .jpdb-reader-word:is(.jpdb-known,.jpdb-due,.jpdb-never-forget) .jpdb-reader-furi { display: none; }

.jpdb-ocr-layer {
  position: fixed;
  z-index: 2147483643;
  pointer-events: none;
  box-sizing: border-box;
  contain: layout style;
}
.jpdb-ocr-status,
.jpdb-ocr-line {
  pointer-events: auto;
  box-sizing: border-box;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-tap-highlight-color: transparent;
}
.jpdb-ocr-status {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(24,27,32,.82);
  color: rgba(255,255,255,.88);
  box-shadow: 0 8px 22px rgba(0,0,0,.24);
  font-size: 12px;
  font-weight: 700;
}
.jpdb-ocr-line {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  min-width: 32px;
  min-height: 32px;
  padding: .44em .3em .18em;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: transparent;
  text-shadow: none;
  font-weight: 800;
  line-height: 1.08;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  box-shadow: none;
  opacity: 1;
  user-select: text;
  cursor: text;
  transition: opacity .12s ease, background .12s ease, border-color .12s ease;
}
.jpdb-ocr-line-visible {
  border-color: rgba(255,255,255,.16);
  background: rgba(24,27,32,.08);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.08);
}
.jpdb-ocr-line[data-vertical="true"] {
  align-items: center;
  letter-spacing: 0;
}
.jpdb-ocr-line:hover,
.jpdb-ocr-line:focus,
.jpdb-ocr-line.jpdb-ocr-line-active {
  color: var(--jpdb-ocr-text-color, #fff);
  text-shadow:
    0 2px 2px var(--jpdb-ocr-outline-color, #000),
    0 0 3px var(--jpdb-ocr-outline-color, #000),
    0 0 10px var(--jpdb-ocr-outline-color, #000);
  background: var(--jpdb-ocr-background-active-rgba, rgba(24,27,32,.48));
  border-color: rgba(94,167,128,.9);
  outline: none;
  z-index: 2;
}
.jpdb-ocr-line .jpdb-reader-word {
  background: transparent !important;
  text-decoration: none;
  color: inherit;
  pointer-events: none;
  cursor: pointer;
  line-height: 1.08;
}
.jpdb-ocr-line:hover .jpdb-reader-word,
.jpdb-ocr-line:focus .jpdb-reader-word,
.jpdb-ocr-line.jpdb-ocr-line-active .jpdb-reader-word {
  pointer-events: auto;
}
.jpdb-ocr-line .jpdb-reader-word ruby {
  line-height: 1;
}
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-new,
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-not-in-deck { color: #9bbcff; }
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-learning { color: #82d6a6; }
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-known,
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-never-forget,
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-redundant { color: #8ee04a; }
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-due { color: #ffb84d; }
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-failed { color: #ff6b4a; }
.jpdb-ocr-line .jpdb-reader-word rt.jpdb-reader-furi {
  bottom: calc(100% + 1px);
  color: currentColor;
  font-size: .46em;
  opacity: .9;
  text-shadow:
    0 1px 1px var(--jpdb-ocr-outline-color, #000),
    0 0 5px var(--jpdb-ocr-outline-color, #000);
}

.asbplayer-subtitles-container-bottom { z-index: 2147483644 !important; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word {
  background: transparent !important;
  text-decoration: none;
}
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-new { color: #6da3ff; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-not-in-deck { color: #9bbcff; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-learning { color: #82d6a6; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-known,
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-never-forget,
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-redundant { color: #8ee04a; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-due { color: #ffb84d; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-failed { color: #ff6b4a; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-blacklisted,
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-suspended,
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-locked { color: rgba(255,255,255,.48); }

.jpdb-reader-fab {
  position: fixed;
  right: max(14px, env(safe-area-inset-right));
  bottom: max(14px, env(safe-area-inset-bottom));
  z-index: 2147483645;
  min-width: 52px;
  width: auto;
  height: 52px;
  padding: 0 13px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 50%;
  background: var(--jpdb-reader-surface);
  color: var(--jpdb-reader-text);
  box-shadow: 0 10px 28px rgba(0,0,0,.25);
  opacity: .78;
  font: 700 14px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
  touch-action: none;
  transition: opacity .15s ease, border-color .15s ease, color .15s ease;
}
.jpdb-reader-fab:hover,
.jpdb-reader-fab:focus-visible {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-accent);
  opacity: 1;
  outline: none;
}

.jpdb-reader-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  background: rgba(0,0,0,.38);
}

.jpdb-reader-popover,
.jpdb-reader-settings {
  position: fixed;
  z-index: 2147483647;
  box-sizing: border-box;
  background: var(--jpdb-reader-bg);
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0,0,0,.34);
  color: var(--jpdb-reader-text);
  color-scheme: dark;
  font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.jpdb-reader-popover {
  width: min(430px, calc(100vw - 16px));
  max-height: min(540px, calc(100vh - 16px));
  overflow: auto;
  padding: 14px;
}

.jpdb-reader-sheet-handle {
  display: none;
  width: 72px;
  height: 28px;
  border-radius: 999px;
  background: transparent;
  margin: -4px auto 6px;
  cursor: grab;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
.jpdb-reader-sheet-handle::before {
  content: "";
  display: block;
  width: 42px;
  height: 5px;
  border-radius: 999px;
  margin: 11px auto 0;
  background: var(--jpdb-reader-faint);
}
.jpdb-reader-sheet-handle:active {
  cursor: grabbing;
}
.jpdb-reader-sheet-handle:focus-visible::before {
  background: var(--jpdb-reader-accent);
}

.jpdb-reader-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.jpdb-reader-heading {
  min-width: 0;
  flex: 1 1 auto;
}
.jpdb-reader-card-tools {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-left: auto;
}
.jpdb-reader-icon-btn {
  display: inline-grid;
  place-items: center;
  width: 36px !important;
  min-width: 36px !important;
  max-width: 36px !important;
  height: 36px !important;
  min-height: 36px !important;
  max-height: 36px !important;
  flex: 0 0 auto;
  padding: 0 !important;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 50%;
  background: var(--jpdb-reader-surface);
  color: var(--jpdb-reader-text);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.jpdb-reader-icon-btn:hover,
.jpdb-reader-icon-btn:focus-visible {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-accent);
  outline: none;
}

.jpdb-reader-onboarding {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  box-sizing: border-box;
  width: min(760px, calc(100vw - 24px));
  max-height: min(760px, calc(100vh - 24px));
  overflow: auto;
  padding: 32px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 16px;
  background:
    radial-gradient(circle at 18% 0%, var(--jpdb-reader-accent-soft), transparent 34%),
    var(--jpdb-reader-bg);
  color: var(--jpdb-reader-text);
  box-shadow: 0 26px 70px rgba(0,0,0,.4);
  color-scheme: dark;
  font: 15px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-reader-onboarding h2 {
  margin: 4px 0 10px;
  color: var(--jpdb-reader-text);
  font-size: clamp(38px, 8vw, 72px);
  line-height: .95;
  letter-spacing: 0;
}
.jpdb-reader-onboarding p {
  max-width: 620px;
  margin: 0;
  color: var(--jpdb-reader-muted);
}
.jpdb-reader-onboarding-eyebrow {
  color: var(--jpdb-reader-accent);
  font-size: 12px;
  font-weight: 850;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.jpdb-reader-onboarding-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 24px 0;
}
.jpdb-reader-onboarding-grid div {
  display: grid;
  gap: 5px;
  min-height: 96px;
  padding: 14px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
}
.jpdb-reader-onboarding-grid strong {
  color: var(--jpdb-reader-text);
  font-size: 16px;
}
.jpdb-reader-onboarding-grid span,
.jpdb-reader-onboarding-note {
  color: var(--jpdb-reader-muted);
  font-size: 13px;
}
.jpdb-reader-onboarding-language {
  display: grid;
  gap: 6px;
  max-width: 280px;
  margin: 0 0 16px;
  color: var(--jpdb-reader-muted);
  font-weight: 750;
  font-size: 13px;
}
.jpdb-reader-onboarding-language select {
  width: 100%;
  box-sizing: border-box;
  min-height: 42px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  color: var(--jpdb-reader-text);
  padding: 8px 10px;
  font: 750 14px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-reader-onboarding-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}
.jpdb-reader-onboarding-actions .jpdb-reader-btn {
  min-width: 150px;
  min-height: 46px;
}
.jpdb-reader-icon-btn svg {
  width: 20px !important;
  height: 20px !important;
  max-width: 20px !important;
  max-height: 20px !important;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.jpdb-reader-spelling {
  color: var(--jpdb-reader-text);
  font-size: 24px;
  font-weight: 750;
  line-height: 1.16;
  text-decoration: none;
  word-break: keep-all;
}
.jpdb-reader-title-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.jpdb-reader-kanji-inline {
  display: inline;
  margin: 0;
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  line-height: inherit;
  -webkit-tap-highlight-color: transparent;
}
.jpdb-reader-kanji-inline:hover,
.jpdb-reader-kanji-inline:focus-visible {
  border-bottom-color: currentColor;
  outline: none;
}
.jpdb-reader-jpdb-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  padding: 1px 7px;
  border: 1px solid currentColor;
  border-radius: 999px;
  color: var(--jpdb-reader-accent) !important;
  background: var(--jpdb-reader-accent-soft);
  font-size: 10px;
  font-weight: 850;
  line-height: 1.2;
  text-decoration: none;
}
.jpdb-reader-jpdb-pill:hover,
.jpdb-reader-jpdb-pill:focus-visible {
  background: var(--jpdb-reader-hover);
  outline: 2px solid var(--jpdb-reader-accent-soft);
}
.jpdb-reader-jpdb-pill svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.jpdb-reader-reading,
.jpdb-reader-pos,
.jpdb-reader-meta,
.jpdb-reader-help {
  color: var(--jpdb-reader-muted);
}

.jpdb-reader-reading { margin-top: 2px; font-size: 15px; }
.jpdb-reader-pos { margin-top: 7px; font-size: 12px; line-height: 1.35; }
.jpdb-reader-meanings { margin: 9px 0; display: grid; gap: 5px; }
.jpdb-reader-meaning { color: var(--jpdb-reader-text); line-height: 1.35; }
.jpdb-reader-meaning-pos { color: var(--jpdb-reader-faint); font-size: 11px; margin-right: 5px; font-style: italic; text-transform: none; }
.jpdb-reader-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 12px; }
.jpdb-reader-inline-link { color: var(--jpdb-reader-accent); font-weight: 800; text-decoration: none; }
.jpdb-reader-state-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; background: var(--jpdb-reader-faint); margin-right: 4px; }
.jpdb-reader-state-dot.jpdb-new { background: #4b8dff; }
.jpdb-reader-state-dot.jpdb-learning, .jpdb-reader-state-dot.jpdb-never-forget { background: #5ea780; }
.jpdb-reader-state-dot.jpdb-known, .jpdb-reader-state-dot.jpdb-redundant { background: #70c000; }
.jpdb-reader-state-dot.jpdb-due { background: #ffa500; }
.jpdb-reader-state-dot.jpdb-failed { background: #ff4500; }
.jpdb-reader-state-dot.jpdb-blacklisted { background: #555; }

.jpdb-reader-local {
  border-top: 1px solid var(--jpdb-reader-border);
  margin-top: 12px;
  padding-top: 12px;
  display: grid;
  gap: 8px;
}
.jpdb-reader-definition-stack {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.jpdb-reader-definition-stack .jpdb-reader-local {
  margin-top: 0;
}
.jpdb-reader-source-card .jpdb-reader-meanings {
  margin: 0;
}
.jpdb-reader-local-title {
  color: var(--jpdb-reader-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}
.jpdb-reader-local-entry {
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  padding: 8px;
}
.jpdb-reader-local-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-weight: 700;
}
.jpdb-reader-local-reading,
.jpdb-reader-local-dict {
  color: var(--jpdb-reader-muted);
  font-size: 12px;
  font-weight: 500;
}
.jpdb-reader-local-dict {
  margin-left: auto;
}
.jpdb-reader-local-glossary {
  margin-top: 6px;
  color: var(--jpdb-reader-text);
  font-size: 13px;
  white-space: pre-wrap;
  display: grid;
  gap: 4px;
}
.jpdb-reader-local-glossary ul,
.jpdb-reader-local-glossary ol {
  margin: 4px 0 4px 18px;
  padding: 0;
}
.jpdb-reader-local-glossary table {
  border-collapse: collapse;
  width: 100%;
  white-space: normal;
}
.jpdb-reader-local-glossary td,
.jpdb-reader-local-glossary th {
  border: 1px solid var(--jpdb-reader-border);
  padding: 4px 6px;
}
.jpdb-reader-immersion {
  gap: 8px;
}
.jpdb-reader-example-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 9px;
  align-items: stretch;
  padding: 8px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
}
.jpdb-reader-example-card.has-image {
  grid-template-columns: minmax(0, 86px) minmax(0, 1fr);
}
.jpdb-reader-example-image {
  width: 86px;
  height: 74px;
  object-fit: cover;
  border-radius: 6px;
  background: var(--jpdb-reader-surface-2);
}
.jpdb-reader-example-body {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.jpdb-reader-example-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--jpdb-reader-muted);
  font-size: 11px;
  font-weight: 750;
}
.jpdb-reader-example-meta span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jpdb-reader-example-sentence {
  color: var(--jpdb-reader-text);
  font-size: 14px;
  line-height: 1.42;
  overflow-wrap: anywhere;
}
.jpdb-reader-example-translation {
  color: var(--jpdb-reader-muted);
  font-size: 12px;
  line-height: 1.35;
}
.jpdb-reader-example-actions {
  display: flex;
  gap: 7px;
  margin-top: 2px;
}
.jpdb-reader-example-actions .jpdb-reader-icon-mini {
  min-width: 34px;
}
.jpdb-reader-example-actions svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.jpdb-reader-media-note { color: var(--jpdb-reader-muted); font-style: italic; }
.jpdb-reader-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-muted);
  font-weight: 700;
}
.jpdb-reader-dict-meta { margin: 8px 0 0; gap: 6px; }
.jpdb-reader-kanji-char { font-size: 20px; }
.jpdb-reader-kanji-readings {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--jpdb-reader-muted);
  font-size: 12px;
  margin-top: 6px;
}
.jpdb-reader-kanji-nav {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  color: var(--jpdb-reader-muted);
  font-size: 12px;
  font-weight: 750;
}
.jpdb-reader-kanji-nav span {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jpdb-reader-kanji-display {
  color: var(--jpdb-reader-text);
  font-size: 42px;
  font-weight: 850;
  line-height: 1;
}
.jpdb-reader-kanji-title-row {
  align-items: center;
  gap: 9px;
}
.jpdb-reader-kanji-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.jpdb-reader-kanji-keyword {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--jpdb-reader-accent) 50%, var(--jpdb-reader-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--jpdb-reader-accent) 13%, transparent);
  color: var(--jpdb-reader-text);
  font-size: 12px;
  font-weight: 800;
}
.jpdb-reader-kanji-keyword small {
  color: var(--jpdb-reader-muted);
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
}
.jpdb-reader-kanji-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
  gap: 6px;
}
.jpdb-reader-kanji-facts span {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-text);
  font-size: 12px;
  font-weight: 750;
}
.jpdb-reader-kanji-facts strong {
  color: var(--jpdb-reader-muted);
  font-size: 10px;
  font-weight: 850;
  text-transform: uppercase;
}
.jpdb-reader-origin-map {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.jpdb-reader-origin-node {
  display: grid;
  place-items: center;
  gap: 2px;
  min-height: 58px;
  padding: 7px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--jpdb-reader-accent) 12%, transparent), var(--jpdb-reader-surface-2));
  color: var(--jpdb-reader-text);
  text-align: center;
  font: inherit;
  cursor: pointer;
}
.jpdb-reader-origin-node.current {
  border-color: color-mix(in srgb, var(--jpdb-reader-accent) 64%, var(--jpdb-reader-border));
  background: color-mix(in srgb, var(--jpdb-reader-accent) 18%, var(--jpdb-reader-surface-2));
}
.jpdb-reader-origin-node.related {
  border-style: dashed;
  cursor: default;
}
.jpdb-reader-origin-node:hover,
.jpdb-reader-origin-node:focus-visible {
  border-color: var(--jpdb-reader-accent);
  outline: none;
}
.jpdb-reader-origin-node strong {
  font-size: 20px;
  line-height: 1;
}
.jpdb-reader-origin-node small,
.jpdb-reader-origin-edges small {
  color: var(--jpdb-reader-muted);
  font-size: 10px;
  line-height: 1.2;
}
.jpdb-reader-origin-edges {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.jpdb-reader-origin-edges span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-muted);
  font-size: 11px;
}
.jpdb-reader-origin-detail {
  display: grid;
  gap: 8px;
}
.jpdb-reader-origin-detail p {
  margin: 0;
  color: var(--jpdb-reader-text);
  font-size: 13px;
  line-height: 1.35;
}
.jpdb-reader-origin-detail p span {
  color: var(--jpdb-reader-muted);
}
.jpdb-reader-radical-card {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface-2);
}
.jpdb-reader-radical-glyph {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: var(--jpdb-reader-bg);
  font-size: 28px !important;
  line-height: 1;
}
.jpdb-reader-radical-card img {
  width: 44px;
  height: 44px;
  object-fit: contain;
  border-radius: 6px;
  background: color-mix(in srgb, var(--jpdb-reader-text) 92%, white);
}
.jpdb-reader-radical-card div {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.jpdb-reader-radical-card strong {
  color: var(--jpdb-reader-text);
  font-size: 15px;
}
.jpdb-reader-radical-card span {
  color: var(--jpdb-reader-muted);
  font-size: 12px;
  line-height: 1.3;
}
.jpdb-reader-origin-examples {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 6px;
}
.jpdb-reader-origin-examples button {
  min-width: 0;
  padding: 7px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-text);
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.jpdb-reader-origin-examples button:hover,
.jpdb-reader-origin-examples button:focus-visible {
  border-color: var(--jpdb-reader-accent);
  outline: none;
}
.jpdb-reader-origin-examples strong,
.jpdb-reader-origin-examples span,
.jpdb-reader-origin-examples small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jpdb-reader-origin-examples span,
.jpdb-reader-origin-examples small {
  color: var(--jpdb-reader-muted);
  font-size: 11px;
}
.jpdb-reader-origin-wiktionary {
  color: var(--jpdb-reader-muted);
  font-size: 13px;
}
.jpdb-reader-origin-wiktionary summary {
  color: var(--jpdb-reader-text);
  cursor: pointer;
  font-weight: 800;
}
.jpdb-reader-origin-wiktionary p {
  margin: 7px 0 0;
  line-height: 1.4;
}
.jpdb-reader-origin-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.jpdb-reader-origin-images img {
  width: 64px;
  height: 64px;
  object-fit: contain;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: #fff;
}
.jpdb-reader-origin-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  color: var(--jpdb-reader-muted);
  font-size: 11px;
}
.jpdb-reader-origin-sources a {
  color: var(--jpdb-reader-accent);
  font-weight: 800;
  text-decoration: none;
}
.jpdb-reader-origin-graph-wrap {
  position: relative;
  min-height: 150px;
  margin-top: 8px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--jpdb-reader-accent) 9%, transparent), transparent 56%), var(--jpdb-reader-surface-2);
  overflow: hidden;
}
.jpdb-reader-origin-graph-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.jpdb-reader-origin-graph-lines line {
  stroke: color-mix(in srgb, var(--jpdb-reader-muted) 76%, transparent);
  stroke-width: .8;
}
.jpdb-reader-origin-graph-node {
  position: absolute;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  min-width: 34px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 999px;
  background: var(--jpdb-reader-bg);
  color: var(--jpdb-reader-text);
  font: 850 19px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
}
.jpdb-reader-origin-graph-node.current {
  border-color: var(--jpdb-reader-accent);
  background: color-mix(in srgb, var(--jpdb-reader-accent) 18%, var(--jpdb-reader-bg));
}
.jpdb-reader-origin-graph-node.related {
  color: var(--jpdb-reader-muted);
  cursor: default;
}
.jpdb-reader-origin-graph-node:hover,
.jpdb-reader-origin-graph-node:focus-visible {
  border-color: var(--jpdb-reader-accent);
  outline: none;
}
.jpdb-reader-rtk-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: var(--jpdb-reader-text);
}
.jpdb-reader-rtk-head span {
  color: var(--jpdb-reader-muted);
  font-size: 12px;
}
.jpdb-reader-rtk details,
.jpdb-reader-jpdb-kanji details {
  margin-top: 8px;
  color: var(--jpdb-reader-muted);
}
.jpdb-reader-rtk summary,
.jpdb-reader-jpdb-kanji summary {
  cursor: pointer;
  color: var(--jpdb-reader-text);
  font-weight: 750;
}
.jpdb-reader-rtk p,
.jpdb-reader-jpdb-kanji p {
  margin: 6px 0 0;
  color: var(--jpdb-reader-muted);
  line-height: 1.45;
}
.jpdb-reader-rtk-elements {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.jpdb-reader-rtk-elements span,
.jpdb-reader-rtk-elements button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 750;
}
.jpdb-reader-rtk-elements button strong {
  color: var(--jpdb-reader-text);
  font-size: 14px;
  line-height: 1;
}
.jpdb-reader-rtk-elements button span {
  all: unset;
  color: var(--jpdb-reader-muted);
}
.jpdb-reader-rtk-elements button {
  cursor: pointer;
}
.jpdb-reader-rtk-elements button:hover,
.jpdb-reader-rtk-elements button:focus-visible {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-text);
  outline: none;
}
.jpdb-reader-rtk-elements span + span::before,
.jpdb-reader-rtk-elements span + button::before,
.jpdb-reader-rtk-elements button + span::before,
.jpdb-reader-rtk-elements button + button::before {
  content: "+";
  margin-right: 6px;
  color: color-mix(in srgb, var(--jpdb-reader-accent) 72%, var(--jpdb-reader-muted));
}
.jpdb-reader-component-grid,
.jpdb-reader-similar-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
  gap: 6px;
  margin-top: 8px;
}
.jpdb-reader-component-card,
.jpdb-reader-similar-word {
  min-width: 0;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-text);
  padding: 7px;
}
.jpdb-reader-component-card {
  display: grid;
  gap: 2px;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.jpdb-reader-component-card strong {
  font-size: 18px;
}
.jpdb-reader-component-card span,
.jpdb-reader-component-card small,
.jpdb-reader-similar-word small,
.jpdb-reader-similar-word em {
  color: var(--jpdb-reader-muted);
  font-size: 11px;
  font-style: normal;
}
.jpdb-reader-similar-word {
  display: grid;
  gap: 2px;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.jpdb-reader-similar-word:hover,
.jpdb-reader-similar-word:focus-visible,
.jpdb-reader-component-card:hover,
.jpdb-reader-component-card:focus-visible {
  border-color: var(--jpdb-reader-accent);
  outline: none;
}
.jpdb-reader-doodle-stage {
  position: relative;
  width: min(100%, 240px);
  aspect-ratio: 1 / 1;
  margin: 8px auto 0;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(0,0,0,.08) 1px, transparent 1px),
    linear-gradient(0deg, rgba(0,0,0,.08) 1px, transparent 1px),
    #f8f9fb;
  background-size: 27.25px 27.25px;
  touch-action: none;
}
.jpdb-reader-doodle-ghost,
.jpdb-reader-doodle-canvas {
  position: absolute;
  inset: 0;
}
.jpdb-reader-doodle-ghost {
  display: grid;
  place-items: center;
  opacity: .3;
  pointer-events: none;
}
.jpdb-reader-doodle-stage.trace-hidden .jpdb-reader-doodle-ghost,
.jpdb-reader-doodle-ghost[hidden] {
  display: none !important;
}
.jpdb-reader-doodle-canvas {
  width: 100%;
  height: 100%;
  cursor: crosshair;
  touch-action: none;
}
.jpdb-reader-kanjivg-svg {
  width: 90%;
  max-height: 90%;
}
.jpdb-reader-kanjivg-strokes path {
  fill: none;
  stroke: #141820;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.jpdb-reader-kanjivg-numbers {
  fill: #6b7280;
  font-size: 8px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-reader-kanjivg .jpdb-reader-help {
  color: #3d4654;
}
.jpdb-reader-doodle-text-ghost {
  color: #141820;
  font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif;
  font-size: 180px;
  font-weight: 500;
  line-height: 1;
}
.jpdb-reader-doodle-tools {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 7px;
}
.jpdb-reader-mini-btn {
  min-height: 28px;
  padding: 4px 9px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 7px;
  background: transparent;
  color: var(--jpdb-reader-text);
  cursor: pointer;
  font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-reader-mini-btn:hover,
.jpdb-reader-mini-btn:focus-visible {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-accent);
  outline: none;
}

.jpdb-reader-actions {
  border-top: 1px solid var(--jpdb-reader-border);
  margin-top: 12px;
  padding-top: 12px;
  display: grid;
  gap: 8px;
}

.jpdb-reader-row { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); gap: 6px; }
.jpdb-reader-grades .jpdb-reader-btn {
  min-width: 0;
  min-height: 40px;
  padding-inline: 3px;
  font-size: 9.5px;
  letter-spacing: 0;
  line-height: 1.1;
  white-space: nowrap;
  overflow-wrap: normal;
}
.jpdb-reader-btn {
  min-height: 36px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: transparent;
  color: var(--jpdb-reader-text);
  cursor: pointer;
  font: 600 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-reader-btn:hover { background: var(--jpdb-reader-hover); }
.jpdb-reader-btn:disabled { opacity: .45; cursor: progress; }
.jpdb-reader-btn.add { color: var(--jpdb-reader-accent); border-color: var(--jpdb-reader-accent); }
.jpdb-reader-btn.nf { color: var(--jpdb-reader-accent); border-color: var(--jpdb-reader-accent); }
.jpdb-reader-btn.blacklist { color: #777; border-color: #777; }
.jpdb-reader-btn.anki { color: #88a6ff; border-color: #88a6ff; }
.jpdb-reader-btn.nothing, .jpdb-reader-btn.fail { color: #e74c3c; border-color: #e74c3c; }
.jpdb-reader-btn.something { color: #f39c12; border-color: #f39c12; }
.jpdb-reader-btn.hard { color: #f1c40f; border-color: #f1c40f; }
.jpdb-reader-btn.okay, .jpdb-reader-btn.pass { color: #2ecc71; border-color: #2ecc71; }
.jpdb-reader-btn.easy { color: #3498db; border-color: #3498db; }

.jpdb-reader-pitch svg { display: block; height: 42px; max-width: 128px; }
.jpdb-reader-pitch text { fill: var(--jpdb-reader-text); font-size: 12px; }
.jpdb-reader-pitch polyline { fill: none; stroke: currentColor; stroke-width: 2; }
.jpdb-reader-pitch circle { fill: currentColor; }
.jpdb-reader-pitch .heiban { color: #359eff; }
.jpdb-reader-pitch .atamadaka { color: #fe4b74; }
.jpdb-reader-pitch .nakadaka { color: #fba840; }
.jpdb-reader-pitch .odaka { color: #57ccb7; }
.jpdb-reader-pitch .kifuku { color: #9050f6; }

.jpdb-reader-toast {
  position: fixed;
  left: 50%;
  bottom: max(18px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 2147483647;
  max-width: min(520px, calc(100vw - 24px));
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--jpdb-reader-surface);
  color: var(--jpdb-reader-text);
  border: 1px solid var(--jpdb-reader-border);
  box-shadow: 0 10px 28px rgba(0,0,0,.25);
  font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.jpdb-reader-settings {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(640px, calc(100vw - 20px));
  max-height: min(760px, calc(100vh - 20px));
  overflow: hidden;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.jpdb-reader-settings-head {
  flex: 0 0 auto;
  padding: 18px 18px 0;
}
.jpdb-reader-settings-tabs {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  overflow: visible;
  padding: 0 18px 8px;
}
.jpdb-reader-settings-tab {
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 999px;
  background: var(--jpdb-reader-surface);
  color: var(--jpdb-reader-muted);
  font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
  white-space: nowrap;
}
.jpdb-reader-settings-tab[aria-selected="true"] {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-accent);
  background: var(--jpdb-reader-accent-soft);
}
.jpdb-reader-settings-scroll {
  min-height: 0;
  overflow: auto;
  padding: 0 18px 96px;
  -webkit-overflow-scrolling: touch;
}
.jpdb-reader-settings h2 { margin: 0 0 12px; font-size: 20px; color: var(--jpdb-reader-text) !important; }
.jpdb-reader-settings fieldset { border: 1px solid var(--jpdb-reader-border); border-radius: 8px; margin: 12px 0; padding: 12px; }
.jpdb-reader-settings legend { color: var(--jpdb-reader-muted); padding: 0 6px; }
.jpdb-reader-settings label { display: grid; gap: 5px; margin: 10px 0; color: var(--jpdb-reader-muted) !important; font-size: 12px; }
.jpdb-reader-settings input,
.jpdb-reader-settings select {
  width: 100%;
  box-sizing: border-box;
  min-height: 38px;
  border-radius: 7px;
  border: 1px solid var(--jpdb-reader-border);
  background: var(--jpdb-reader-surface);
  color: var(--jpdb-reader-text);
  padding: 8px;
}
.jpdb-reader-settings input[type="color"] {
  padding: 3px;
  cursor: pointer;
}
.jpdb-reader-settings input[type="checkbox"],
.jpdb-reader-settings input[type="radio"] {
  appearance: none;
  -webkit-appearance: none;
  width: 24px;
  height: 24px;
  min-width: 24px;
  min-height: 24px;
  display: grid;
  place-content: center;
  margin: 0;
  padding: 0;
  border: 1.5px solid var(--jpdb-reader-border);
  background: var(--jpdb-reader-surface-2);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.06);
}
.jpdb-reader-settings input[type="checkbox"] { border-radius: 7px; }
.jpdb-reader-settings input[type="radio"] { border-radius: 999px; }
.jpdb-reader-settings input[type="checkbox"]:checked,
.jpdb-reader-settings input[type="radio"]:checked {
  border-color: var(--jpdb-reader-accent);
  background: var(--jpdb-reader-accent);
  box-shadow: 0 0 0 3px var(--jpdb-reader-accent-soft);
}
.jpdb-reader-settings input[type="checkbox"]:checked::after {
  content: "";
  width: 12px;
  height: 7px;
  border-left: 2.5px solid #11161d;
  border-bottom: 2.5px solid #11161d;
  transform: rotate(-45deg) translate(1px, -1px);
}
.jpdb-reader-settings input[type="radio"]:checked::after {
  content: "";
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #11161d;
}
.jpdb-reader-settings input[type="checkbox"]:focus-visible,
.jpdb-reader-settings input[type="radio"]:focus-visible {
  outline: 2px solid var(--jpdb-reader-accent);
  outline-offset: 3px;
}
.jpdb-reader-settings input[type="file"][data-file] {
  display: none !important;
}
.jpdb-reader-settings [hidden] {
  display: none !important;
}
.jpdb-reader-settings .inline { display: flex; align-items: center; gap: 12px; min-height: 32px; }
.jpdb-reader-settings .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.jpdb-reader-shortcut-group { display: contents; }
.jpdb-reader-settings .footer {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin: 0;
  background: var(--jpdb-reader-bg);
  border-top: 1px solid var(--jpdb-reader-border);
  padding: 12px 18px calc(12px + env(safe-area-inset-bottom));
  box-shadow: 0 -10px 24px rgba(0,0,0,.18);
}
.jpdb-reader-settings .footer .jpdb-reader-btn {
  min-width: 92px;
  padding-inline: 18px;
  font-size: 13px;
}
.jpdb-reader-settings a { color: var(--jpdb-reader-accent) !important; text-decoration: underline; text-underline-offset: 3px; }
.jpdb-reader-settings-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 10px 0; }
.jpdb-reader-support-card {
  display: grid;
  gap: 12px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  padding: 14px;
}
.jpdb-reader-support-title {
  color: var(--jpdb-reader-text);
  font-size: 15px;
  font-weight: 850;
}
.jpdb-reader-support-card p {
  margin: 8px 0 0;
  color: var(--jpdb-reader-muted);
  font-size: 13px;
  line-height: 1.45;
}
.jpdb-reader-support-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.jpdb-reader-support-actions .jpdb-reader-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  text-align: center;
  text-decoration: none !important;
}
.jpdb-reader-dictionary-status {
  margin: 10px 0;
  color: var(--jpdb-reader-muted);
  font-size: 12px;
}
.jpdb-reader-dictionary-priorities { display: grid; gap: 7px; margin: 10px 0; }
.jpdb-reader-recommended-dictionaries {
  display: grid;
  gap: 10px;
  margin: 12px 0;
}
.jpdb-reader-recommended-title {
  color: var(--jpdb-reader-text);
  font-weight: 800;
  font-size: 13px;
}
.jpdb-reader-recommended-group {
  display: grid;
  gap: 7px;
}
.jpdb-reader-recommended-group-title {
  color: var(--jpdb-reader-faint);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .02em;
}
.jpdb-reader-recommended-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px;
  gap: 10px;
  align-items: center;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  padding: 10px;
}
.jpdb-reader-recommended-name {
  display: flex;
  gap: 10px;
  align-items: baseline;
  flex-wrap: wrap;
  color: var(--jpdb-reader-text);
  font-weight: 800;
  font-size: 13px;
}
.jpdb-reader-recommended-name a {
  font-size: 12px;
  font-weight: 700;
}
.jpdb-reader-dictionary-head,
.jpdb-reader-dictionary-row {
  display: grid;
  grid-template-columns: 48px minmax(130px, 1fr) minmax(120px, .8fr) 74px;
  gap: 8px;
  align-items: center;
}
.jpdb-reader-dictionary-head {
  color: var(--jpdb-reader-faint);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}
.jpdb-reader-dictionary-row {
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  padding: 8px;
  cursor: grab;
}
.jpdb-reader-dictionary-row.jpdb-reader-dragging {
  opacity: .58;
  border-color: var(--jpdb-reader-accent);
}
.jpdb-reader-dictionary-row-help {
  grid-column: 2 / -1;
  color: var(--jpdb-reader-muted);
  font-size: 12px;
  line-height: 1.35;
}
.jpdb-reader-settings .jpdb-reader-dictionary-toggle { margin: 0; justify-content: center; color: var(--jpdb-reader-text); }
.jpdb-reader-audio-sources { display: grid; gap: 7px; margin: 12px 0; }
.jpdb-reader-audio-source-head,
.jpdb-reader-audio-source-row {
  display: grid;
  grid-template-columns: 44px minmax(150px, .8fr) minmax(0, 1.2fr) 96px;
  gap: 8px;
  align-items: start;
}
.jpdb-reader-audio-source-head { color: var(--jpdb-reader-faint); font-size: 11px; font-weight: 700; text-transform: uppercase; }
.jpdb-reader-audio-source-row {
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  padding: 8px;
}
.jpdb-reader-settings .jpdb-reader-audio-index { margin: 0; min-height: 38px; justify-content: center; color: var(--jpdb-reader-text); }
.jpdb-reader-audio-source-fields { display: grid; gap: 6px; }
.jpdb-reader-row-tools {
  display: flex;
  gap: 5px;
  justify-content: flex-end;
}
.jpdb-reader-icon-mini {
  width: 28px !important;
  min-width: 28px !important;
  max-width: 28px !important;
  height: 28px !important;
  min-height: 28px !important;
  max-height: 28px !important;
  padding: 0 !important;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 7px;
  background: transparent;
  color: var(--jpdb-reader-text);
  cursor: pointer;
  font: 800 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-reader-icon-mini:hover,
.jpdb-reader-icon-mini:focus-visible {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-accent);
  outline: none;
}

.jpdb-subtitle-player {
  position: fixed;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  z-index: 2147483644;
  pointer-events: none;
  --subtitle-font-size: 28px;
  --subtitle-bottom: 12%;
  --subtitle-color: #fff;
  --subtitle-outline: #000;
  --subtitle-background-rgba: rgba(24,27,32,.32);
  --subtitle-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --subtitle-weight: 850;
}
.jpdb-subtitle-text {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: var(--subtitle-bottom);
  color: var(--subtitle-color);
  text-align: center;
  font: var(--subtitle-weight) var(--subtitle-font-size)/1.26 var(--subtitle-family);
  text-shadow:
    0 2px 2px var(--subtitle-outline),
    0 0 2px var(--subtitle-outline),
    0 0 10px rgba(0,0,0,.96),
    0 0 18px rgba(0,0,0,.78);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;
}
.jpdb-subtitle-primary {
  display: inline;
  padding: .08em .34em .17em;
  border-radius: 7px;
  background: linear-gradient(90deg, transparent, var(--subtitle-background-rgba) 10%, var(--subtitle-background-rgba) 90%, transparent);
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  -webkit-text-stroke: .028em color-mix(in srgb, var(--subtitle-outline) 72%, transparent);
  paint-order: stroke fill;
}
.jpdb-subtitle-secondary {
  display: block;
  margin-top: 8px;
  color: rgba(255,255,255,.82);
  font-size: .62em;
  font-weight: 650;
  line-height: 1.25;
  text-shadow: 0 2px 2px #000, 0 0 7px rgba(0,0,0,.86);
}
.jpdb-subtitle-primary .jpdb-reader-word {
  background: transparent !important;
  color: var(--subtitle-color);
  text-decoration: none;
  text-shadow:
    0 2px 2px var(--subtitle-outline),
    0 0 2px var(--subtitle-outline),
    0 0 10px rgba(0,0,0,.96),
    0 0 18px rgba(0,0,0,.78);
  -webkit-text-stroke: .028em color-mix(in srgb, var(--subtitle-outline) 72%, transparent);
  paint-order: stroke fill;
}
.jpdb-subtitle-primary .jpdb-reader-word:hover,
.jpdb-subtitle-primary .jpdb-reader-word:focus {
  background: rgba(255,255,255,.14) !important;
}
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-new { color: #6da3ff; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-not-in-deck { color: #9bbcff; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-learning { color: #82d6a6; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-known,
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-never-forget,
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-redundant { color: #8ee04a; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-due { color: #ffb84d; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-failed { color: #ff6b4a; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-blacklisted,
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-suspended,
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-locked { color: rgba(255,255,255,.48); }
.jpdb-subtitle-primary .jpdb-reader-furi { color: currentColor; opacity: .8; }
.jpdb-subtitle-rail {
  position: absolute;
  right: max(10px, env(safe-area-inset-right));
  top: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  pointer-events: auto;
  opacity: .72;
  transition: opacity .14s ease;
}
.jpdb-subtitle-controls-hidden .jpdb-subtitle-rail,
.jpdb-subtitle-controls-hidden .jpdb-subtitle-menu,
.jpdb-subtitle-controls-hidden .jpdb-subtitle-list {
  display: none !important;
}
.jpdb-subtitle-controls-auto .jpdb-subtitle-rail:not(:hover) {
  opacity: .42;
}
.jpdb-subtitle-controls-always .jpdb-subtitle-rail {
  opacity: 1;
}
.jpdb-subtitle-rail:hover,
.jpdb-subtitle-menu-open .jpdb-subtitle-rail {
  opacity: 1;
}
.jpdb-subtitle-rail button,
.jpdb-subtitle-menu button,
.jpdb-subtitle-list button {
  border: 1px solid rgba(255,255,255,.22);
  border-radius: 8px;
  background: rgba(24,27,32,.78);
  color: #fff;
  box-shadow: 0 8px 20px rgba(0,0,0,.28);
  font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  pointer-events: auto;
}
.jpdb-subtitle-rail button {
  min-width: 34px;
  min-height: 32px;
  padding: 0 9px;
}
.jpdb-subtitle-rail button[hidden],
.jpdb-subtitle-status[hidden],
.jpdb-subtitle-menu button[hidden] {
  display: none !important;
}
.jpdb-subtitle-rail button:disabled {
  opacity: .45;
}
.jpdb-subtitle-status {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 9px;
  border-radius: 8px;
  background: rgba(24,27,32,.62);
  color: rgba(255,255,255,.78);
  border: 1px solid rgba(255,255,255,.16);
  box-shadow: 0 8px 20px rgba(0,0,0,.18);
  font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-subtitle-menu {
  position: absolute;
  right: max(10px, env(safe-area-inset-right));
  top: 50px;
  display: grid;
  gap: 6px;
  width: min(230px, calc(100vw - 24px));
  padding: 8px;
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 10px;
  background: rgba(24,27,32,.88);
  box-shadow: 0 14px 34px rgba(0,0,0,.32);
  pointer-events: auto;
}
.jpdb-subtitle-menu[hidden],
.jpdb-subtitle-list[hidden] { display: none; }
.jpdb-subtitle-menu button {
  min-height: 36px;
  text-align: left;
  padding: 0 10px;
  box-shadow: none;
}
.jpdb-subtitle-list {
  position: absolute;
  right: max(10px, env(safe-area-inset-right));
  top: 50px;
  width: min(460px, calc(100vw - 24px));
  max-height: min(62vh, 520px);
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 10px;
  background: rgba(24,27,32,.92);
  color: #fff;
  box-shadow: 0 14px 34px rgba(0,0,0,.32);
  pointer-events: auto;
}
.jpdb-subtitle-list-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 9px;
  border-bottom: 1px solid rgba(255,255,255,.12);
  color: rgba(255,255,255,.78);
  font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-subtitle-list-scroll {
  overflow: auto;
  display: grid;
  gap: 2px;
  padding: 6px;
}
.jpdb-subtitle-list-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  min-height: 38px;
  padding: 8px;
  text-align: left;
  box-shadow: none;
}
.jpdb-subtitle-list-row.active {
  border-color: rgba(94,167,128,.88);
  background: rgba(94,167,128,.2);
}
.jpdb-subtitle-list-row span {
  color: rgba(255,255,255,.55);
  font-size: 11px;
}
.jpdb-subtitle-list-row strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 700;
  line-height: 1.35;
}
.jpdb-subtitle-track-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 7px;
  padding: 9px;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 8px;
  background: rgba(255,255,255,.05);
}
.jpdb-subtitle-track-row.active {
  border-color: rgba(94,167,128,.82);
  background: rgba(94,167,128,.18);
}
.jpdb-subtitle-track-row strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}
.jpdb-subtitle-track-row span {
  color: rgba(255,255,255,.62);
  font-size: 11px;
  font-weight: 700;
}
.jpdb-subtitle-track-row div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.jpdb-subtitle-list-empty {
  padding: 12px;
  color: rgba(255,255,255,.72);
  font: 700 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-subtitle-hidden .jpdb-subtitle-text { display: none; }

.jpdb-youtube-filtered {
  display: none !important;
}
.jpdb-youtube-filter-bar {
  position: fixed;
  left: 50%;
  bottom: max(18px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 2147483645;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(560px, calc(100vw - 24px));
  padding: 8px 10px 8px 12px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 999px;
  background: var(--jpdb-reader-bg);
  color: var(--jpdb-reader-muted);
  box-shadow: 0 12px 34px rgba(0,0,0,.28);
  font: 750 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-youtube-filter-bar span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jpdb-youtube-filter-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
.jpdb-youtube-filter-bar button {
  flex: 0 0 auto;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--jpdb-reader-accent);
  border-radius: 999px;
  background: transparent;
  color: var(--jpdb-reader-accent);
  font: inherit;
  cursor: pointer;
}
.jpdb-youtube-filter-bar [data-action="turn-off"] {
  border-color: var(--jpdb-reader-border);
  color: var(--jpdb-reader-muted);
}

@media (max-width: 768px), (pointer: coarse) {
  .jpdb-reader-popover.jpdb-reader-sheet {
    left: 0 !important;
    right: 0 !important;
    top: auto !important;
    bottom: 0 !important;
    width: 100%;
    max-height: min(70vh, 620px);
    border-radius: 16px 16px 0 0;
    padding: 14px 16px calc(18px + env(safe-area-inset-bottom));
  }
  .jpdb-reader-popover.jpdb-reader-sheet.jpdb-reader-sheet-expanded {
    max-height: min(92vh, 840px);
    max-height: min(92svh, 840px);
  }
  .jpdb-reader-sheet .jpdb-reader-sheet-handle { display: block; }
  .jpdb-reader-btn { min-height: 44px; font-size: 13px; }
  .jpdb-reader-settings { inset: auto 0 0 0; transform: none; width: 100%; max-height: 88vh; max-height: 88svh; border-radius: 16px 16px 0 0; }
  .jpdb-reader-settings-head { padding: 18px 20px 0; }
  .jpdb-reader-settings-scroll { padding: 0 20px 106px; }
  .jpdb-reader-settings .footer {
    justify-content: stretch;
    gap: 12px;
    padding: 12px 20px calc(14px + env(safe-area-inset-bottom));
  }
  .jpdb-reader-settings .footer .jpdb-reader-btn {
    flex: 1 1 0;
    min-width: 0;
  }
  .jpdb-reader-settings .grid { grid-template-columns: 1fr; }
  .jpdb-reader-settings-actions { grid-template-columns: 1fr; }
  .jpdb-reader-support-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .jpdb-reader-recommended-item { grid-template-columns: 1fr; }
  .jpdb-reader-onboarding {
    inset: auto 0 0 0;
    transform: none;
    width: 100%;
    max-height: 88vh;
    max-height: 88svh;
    border-radius: 16px 16px 0 0;
    padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
  }
  .jpdb-reader-onboarding-grid { grid-template-columns: 1fr; }
  .jpdb-reader-onboarding-actions { display: grid; grid-template-columns: 1fr; }
  .jpdb-youtube-filter-bar {
    bottom: max(76px, calc(60px + env(safe-area-inset-bottom)));
    border-radius: 12px;
  }
  .jpdb-reader-dictionary-head { display: none; }
  .jpdb-reader-dictionary-row { grid-template-columns: 52px 1fr; }
  .jpdb-reader-dictionary-row input[name$=".alias"],
  .jpdb-reader-dictionary-row .jpdb-reader-row-tools,
  .jpdb-reader-dictionary-row-help { grid-column: 2; }
  .jpdb-reader-dictionary-row .jpdb-reader-row-tools { justify-content: flex-start; }
  .jpdb-reader-audio-source-head { display: none; }
  .jpdb-reader-audio-source-row { grid-template-columns: 52px 1fr; }
  .jpdb-reader-audio-source-row > select { grid-column: 2; }
  .jpdb-reader-audio-source-fields { grid-column: 1 / -1; }
  .jpdb-reader-audio-source-row .jpdb-reader-row-tools {
    grid-column: 2;
    justify-content: flex-start;
  }
  .jpdb-reader-icon-mini {
    width: 34px !important;
    min-width: 34px !important;
    max-width: 34px !important;
    height: 34px !important;
    min-height: 34px !important;
    max-height: 34px !important;
  }
  .jpdb-ocr-line { min-width: 38px; min-height: 38px; border-radius: 8px; }
  .jpdb-subtitle-text { left: 8px; right: 8px; font-size: min(var(--subtitle-font-size), 8vw); }
  .jpdb-subtitle-rail {
    top: auto;
    right: max(8px, env(safe-area-inset-right));
    bottom: max(8px, env(safe-area-inset-bottom));
  }
  .jpdb-subtitle-rail button { min-height: 40px; min-width: 42px; }
  .jpdb-subtitle-menu,
  .jpdb-subtitle-list {
    top: auto;
    right: 8px;
    bottom: calc(58px + env(safe-area-inset-bottom));
  }
}
`;
