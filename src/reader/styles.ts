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
.jpdb-reader-hide-known .jpdb-reader-word:is(.jpdb-known,.jpdb-due,.jpdb-never-forget) .jpdb-reader-furi { display: none; }

.jpdb-ocr-layer {
  position: fixed;
  z-index: 2147483643;
  pointer-events: none;
  box-sizing: border-box;
  contain: layout style;
}
.jpdb-ocr-chip,
.jpdb-ocr-status,
.jpdb-ocr-line {
  pointer-events: auto;
  box-sizing: border-box;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-tap-highlight-color: transparent;
}
.jpdb-ocr-chip {
  position: absolute;
  right: 8px;
  top: 8px;
  min-width: 44px;
  min-height: 36px;
  border: 1px solid rgba(255,255,255,.22);
  border-radius: 999px;
  background: rgba(24,27,32,.78);
  color: #fff;
  box-shadow: 0 8px 22px rgba(0,0,0,.26);
  font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-ocr-chip[hidden] { display: none; }
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
  overflow: hidden;
  min-width: 32px;
  min-height: 32px;
  padding: 3px;
  border: 1px solid rgba(255,255,255,.26);
  border-radius: 6px;
  background: rgba(24,27,32,.18);
  color: #fff;
  text-shadow: 0 2px 2px #000, 0 0 8px rgba(0,0,0,.92);
  font-weight: 900;
  line-height: 1.08;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.14);
}
.jpdb-ocr-line[data-vertical="true"] {
  align-items: center;
  letter-spacing: 0;
}
.jpdb-ocr-line:hover,
.jpdb-ocr-line:focus {
  background: rgba(94,167,128,.28);
  border-color: rgba(94,167,128,.9);
  outline: none;
}
.jpdb-ocr-line .jpdb-reader-word {
  background: transparent !important;
  text-decoration: none;
  color: inherit;
}
.jpdb-ocr-line .jpdb-reader-word.jpdb-new,
.jpdb-ocr-line .jpdb-reader-word.jpdb-not-in-deck { color: #9bbcff; }
.jpdb-ocr-line .jpdb-reader-word.jpdb-learning { color: #82d6a6; }
.jpdb-ocr-line .jpdb-reader-word.jpdb-known,
.jpdb-ocr-line .jpdb-reader-word.jpdb-never-forget,
.jpdb-ocr-line .jpdb-reader-word.jpdb-redundant { color: #8ee04a; }
.jpdb-ocr-line .jpdb-reader-word.jpdb-due { color: #ffb84d; }
.jpdb-ocr-line .jpdb-reader-word.jpdb-failed { color: #ff6b4a; }
.jpdb-ocr-line .jpdb-reader-furi { color: currentColor; opacity: .82; }

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
  width: 52px;
  height: 52px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 50%;
  background: var(--jpdb-reader-surface);
  color: var(--jpdb-reader-text);
  box-shadow: 0 10px 28px rgba(0,0,0,.25);
  font: 700 14px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
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
  font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.jpdb-reader-popover {
  width: min(370px, calc(100vw - 16px));
  max-height: min(540px, calc(100vh - 16px));
  overflow: auto;
  padding: 14px;
}

.jpdb-reader-sheet-handle {
  display: none;
  width: 38px;
  height: 4px;
  border-radius: 999px;
  background: var(--jpdb-reader-faint);
  margin: 2px auto 12px;
}

.jpdb-reader-header {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.jpdb-reader-spelling {
  color: var(--jpdb-reader-text);
  font-size: 24px;
  font-weight: 750;
  line-height: 1.16;
  text-decoration: none;
  word-break: keep-all;
}
.jpdb-reader-jpdb-link {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}
.jpdb-reader-jpdb-link::after {
  content: "JPDB";
  color: var(--jpdb-reader-accent);
  border: 1px solid currentColor;
  border-radius: 999px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.4;
}

.jpdb-reader-reading,
.jpdb-reader-pos,
.jpdb-reader-meta,
.jpdb-reader-help {
  color: var(--jpdb-reader-muted);
}

.jpdb-reader-reading { margin-top: 2px; font-size: 15px; }
.jpdb-reader-pos { margin-top: 7px; font-size: 11px; text-transform: uppercase; }
.jpdb-reader-meanings { margin: 10px 0; display: grid; gap: 6px; }
.jpdb-reader-meaning { color: var(--jpdb-reader-text); }
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
  padding-inline: 2px;
  font-size: 10px;
  letter-spacing: 0;
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
.jpdb-reader-btn.add { color: #70c000; border-color: #70c000; }
.jpdb-reader-btn.nf { color: #5ea780; border-color: #5ea780; }
.jpdb-reader-btn.blacklist { color: #777; border-color: #777; }
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
.jpdb-reader-settings-scroll {
  min-height: 0;
  overflow: auto;
  padding: 0 18px 16px;
  -webkit-overflow-scrolling: touch;
}
.jpdb-reader-settings h2 { margin: 0 0 12px; font-size: 20px; }
.jpdb-reader-settings fieldset { border: 1px solid var(--jpdb-reader-border); border-radius: 8px; margin: 12px 0; padding: 12px; }
.jpdb-reader-settings legend { color: var(--jpdb-reader-muted); padding: 0 6px; }
.jpdb-reader-settings label { display: grid; gap: 5px; margin: 10px 0; color: var(--jpdb-reader-muted); font-size: 12px; }
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
  border-color: #70c000;
  background: #70c000;
  box-shadow: 0 0 0 3px rgba(112,192,0,.18);
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
  outline: 2px solid #70c000;
  outline-offset: 3px;
}
.jpdb-reader-settings .inline { display: flex; align-items: center; gap: 12px; min-height: 32px; }
.jpdb-reader-settings .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
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
.jpdb-reader-settings a { color: var(--jpdb-reader-accent); }
.jpdb-reader-settings-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 10px 0; }
.jpdb-reader-dictionary-status {
  margin: 10px 0;
  color: var(--jpdb-reader-muted);
  font-size: 12px;
}
.jpdb-reader-dictionary-priorities { display: grid; gap: 7px; margin: 10px 0; }
.jpdb-reader-dictionary-head,
.jpdb-reader-dictionary-row {
  display: grid;
  grid-template-columns: 46px minmax(130px, 1fr) minmax(120px, .8fr) 74px;
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
}
.jpdb-reader-settings .jpdb-reader-dictionary-toggle { margin: 0; justify-content: center; color: var(--jpdb-reader-text); }
.jpdb-reader-audio-sources { display: grid; gap: 7px; margin: 12px 0; }
.jpdb-reader-audio-source-head,
.jpdb-reader-audio-source-row {
  display: grid;
  grid-template-columns: 44px minmax(150px, .8fr) minmax(0, 1.2fr);
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
}
.jpdb-subtitle-text {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: var(--subtitle-bottom);
  color: #fff;
  text-align: center;
  font: 800 var(--subtitle-font-size)/1.28 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  text-shadow: 0 2px 2px #000, 0 0 8px rgba(0,0,0,.9);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;
}
.jpdb-subtitle-primary {
  display: block;
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
  color: #fff;
  text-decoration: none;
  text-shadow: 0 2px 2px #000, 0 0 8px rgba(0,0,0,.9);
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
  .jpdb-reader-sheet .jpdb-reader-sheet-handle { display: block; }
  .jpdb-reader-btn { min-height: 44px; font-size: 13px; }
  .jpdb-reader-settings { inset: auto 0 0 0; transform: none; width: 100%; max-height: 88vh; max-height: 88svh; border-radius: 16px 16px 0 0; }
  .jpdb-reader-settings-head { padding: 18px 20px 0; }
  .jpdb-reader-settings-scroll { padding: 0 20px 16px; }
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
  .jpdb-reader-dictionary-head { display: none; }
  .jpdb-reader-dictionary-row { grid-template-columns: 52px 1fr; }
  .jpdb-reader-dictionary-row input[name$=".alias"],
  .jpdb-reader-dictionary-row input[name$=".priority"] { grid-column: 2; }
  .jpdb-reader-audio-source-head { display: none; }
  .jpdb-reader-audio-source-row { grid-template-columns: 52px 1fr; }
  .jpdb-reader-audio-source-fields { grid-column: 1 / -1; }
  .jpdb-ocr-chip { min-width: 48px; min-height: 42px; right: 6px; top: 6px; }
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
