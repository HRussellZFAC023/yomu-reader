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
  --jpdb-reader-accent-readable: #76bd99;
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
    --jpdb-reader-accent-readable: #25573d;
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
  --jpdb-reader-accent-readable: #76bd99;
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
  --jpdb-reader-accent-readable: #25573d;
  --jpdb-reader-hover: rgba(20,30,45,.07);
}

.jpdb-reader-middle-scan-active {
  overscroll-behavior: none;
  cursor: crosshair;
}

.jpdb-reader-middle-scan-active * {
  cursor: crosshair !important;
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

.jpdb-reader-newtab-document,
.jpdb-reader-newtab-document body {
  min-height: 100%;
  margin: 0;
  background: var(--jpdb-newtab-bg, var(--jpdb-reader-accent));
}

.jpdb-reader-newtab {
  min-height: 100dvh;
  width: 100%;
  background: var(--jpdb-newtab-bg, var(--jpdb-reader-accent));
  color: var(--jpdb-newtab-bg-text, #111);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  overflow-x: hidden;
}

.jpdb-reader-newtab-shell {
  width: min(1280px, calc(100vw - 32px));
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 18px;
  margin: 0 auto;
  padding: max(16px, env(safe-area-inset-top)) 0 max(18px, env(safe-area-inset-bottom));
}

.jpdb-reader-newtab-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
}

.jpdb-reader-newtab-brand {
  border: 0;
  padding: 0;
  background: transparent;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--jpdb-newtab-bg-text, #111);
  cursor: pointer;
  text-decoration: none;
}

.jpdb-reader-newtab-brand-mark,
.jpdb-reader-newtab-puck {
  width: 42px;
  height: 42px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--jpdb-newtab-border, rgba(255,255,255,.55));
  border-radius: 50%;
  background: var(--jpdb-newtab-surface, #fff);
  color: var(--jpdb-newtab-surface-text, #15171c);
  box-shadow: 0 10px 26px var(--jpdb-newtab-shadow, rgba(0,0,0,.18));
  font-size: 17px;
  line-height: 1;
  font-weight: 900;
}

.jpdb-reader-newtab-brand-text {
  display: grid;
  gap: 1px;
  text-align: left;
}

.jpdb-reader-newtab-brand-text strong {
  font-size: 20px;
  line-height: 1;
  font-weight: 900;
}

.jpdb-reader-newtab-brand-text span,
.jpdb-reader-newtab-health {
  font-size: 12px;
  line-height: 1.2;
  font-weight: 760;
  opacity: .96;
}

.jpdb-reader-newtab-health {
  max-width: min(46vw, 520px);
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jpdb-reader-newtab-icon-button {
  min-height: 38px;
  border: 1px solid var(--jpdb-newtab-border, rgba(255,255,255,.55));
  border-radius: 8px;
  padding: 7px 12px;
  background: color-mix(in srgb, var(--jpdb-newtab-surface, #fff) 78%, transparent);
  color: var(--jpdb-newtab-bg-text, #111);
  font-size: 13px;
  font-weight: 820;
  cursor: pointer;
}

.jpdb-reader-newtab-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 390px);
  gap: 18px;
  align-items: stretch;
}

.jpdb-reader-newtab-button {
  min-height: 44px;
  border: 1px solid var(--jpdb-newtab-soft-border, rgba(0,0,0,.14));
  border-radius: 8px;
  padding: 9px 16px;
  background: var(--jpdb-newtab-surface-muted, rgba(255,255,255,.82));
  color: var(--jpdb-newtab-surface-text, #15171c);
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.jpdb-reader-newtab-button.primary {
  background: var(--jpdb-newtab-accent-text, var(--jpdb-reader-accent));
  color: var(--jpdb-newtab-surface, #fff);
  border-color: transparent;
}

.jpdb-reader-newtab-button:hover,
.jpdb-reader-newtab-button:focus-visible,
.jpdb-reader-newtab-icon-button:hover,
.jpdb-reader-newtab-icon-button:focus-visible,
.jpdb-reader-newtab-puck:hover,
.jpdb-reader-newtab-puck:focus-visible,
.jpdb-reader-newtab-list-item:hover,
.jpdb-reader-newtab-list-item:focus-visible,
.jpdb-reader-newtab-filter-grid button:hover,
.jpdb-reader-newtab-filter-grid button:focus-visible,
.jpdb-reader-newtab-segmented button:hover,
.jpdb-reader-newtab-segmented button:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--jpdb-newtab-bg-text, #111) 32%, transparent);
  outline-offset: 2px;
}

.jpdb-reader-newtab-stage {
  display: grid;
  grid-template-rows: auto auto;
  align-content: center;
  gap: 12px;
  min-width: 0;
}

.jpdb-reader-newtab-card {
  width: 100%;
  min-height: clamp(430px, calc(100dvh - 190px), 660px);
  align-self: center;
  display: grid;
  grid-template-rows: auto .42fr auto auto auto;
  align-content: center;
  justify-items: center;
  gap: clamp(12px, 2.2vh, 22px);
  padding: clamp(22px, 4.2vw, 58px);
  border: 1px solid var(--jpdb-newtab-border, rgba(255,255,255,.55));
  border-radius: 18px;
  box-shadow: 0 18px 48px var(--jpdb-newtab-shadow, rgba(0,0,0,.18));
  background: var(--jpdb-newtab-surface, #fff);
  color: var(--jpdb-newtab-surface-text, #15171c);
  cursor: pointer;
  user-select: none;
  overflow: hidden;
}

.jpdb-reader-newtab-card:focus-visible {
  outline: 3px solid var(--jpdb-newtab-bg-text, #111);
  outline-offset: 4px;
}

.jpdb-reader-newtab-card-head,
.jpdb-reader-newtab-meta,
.jpdb-reader-newtab-controls,
.jpdb-reader-newtab-panel-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.jpdb-reader-newtab-card-head,
.jpdb-reader-newtab-meta {
  color: color-mix(in srgb, var(--jpdb-newtab-surface-text, #15171c) 62%, transparent);
  font-size: 12px;
  line-height: 1.2;
  font-weight: 820;
  text-transform: uppercase;
}

.jpdb-reader-newtab-meta {
  justify-content: center;
  flex-wrap: wrap;
  text-transform: none;
}

.jpdb-reader-newtab-meta span {
  max-width: 100%;
  border: 1px solid var(--jpdb-newtab-soft-border, rgba(0,0,0,.12));
  border-radius: 999px !important;
  padding: 5px 9px;
  background: var(--jpdb-newtab-surface-muted, rgba(0,0,0,.04));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jpdb-reader-newtab-visual {
  width: min(170px, 22vw);
  height: min(170px, 22vw);
  display: grid;
  place-items: center;
  border: 1px solid var(--jpdb-newtab-soft-border, rgba(0,0,0,.12));
  border-radius: 16px;
  background: var(--jpdb-newtab-surface-muted, rgba(0,0,0,.04));
  color: color-mix(in srgb, var(--jpdb-newtab-accent-text, var(--jpdb-reader-accent)) 26%, transparent);
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-size: clamp(54px, 8vw, 112px);
  font-weight: 900;
  line-height: 1;
}

.jpdb-reader-newtab-word {
  max-width: 100%;
  color: var(--jpdb-newtab-accent-text, var(--jpdb-reader-accent));
  font-size: clamp(54px, 9.4vw, 136px);
  font-weight: 900;
  line-height: 1.02;
  text-align: center;
  overflow-wrap: anywhere;
  letter-spacing: 0;
}

.jpdb-reader-newtab-word .jpdb-reader-word {
  background: transparent !important;
  color: inherit;
  text-decoration-color: transparent !important;
}

.jpdb-reader-newtab-answer {
  display: grid;
  gap: 8px;
  justify-items: center;
  max-width: 100%;
  transition: opacity .16s ease, transform .16s ease, filter .16s ease;
}

.jpdb-reader-newtab:not(.jpdb-reader-newtab-revealed) .jpdb-reader-newtab-answer {
  opacity: 0;
  filter: blur(7px);
  transform: translateY(4px);
  pointer-events: none;
}

.jpdb-reader-newtab-revealed .jpdb-reader-newtab-concealed {
  display: none;
}

.jpdb-reader-newtab-reading {
  min-height: 1.15em;
  max-width: min(680px, 100%);
  color: var(--jpdb-newtab-accent-text, var(--jpdb-reader-accent));
  font-size: clamp(24px, 4.2vw, 54px);
  font-weight: 720;
  line-height: 1.15;
  text-align: center;
  overflow-wrap: anywhere;
}

.jpdb-reader-newtab-meaning {
  max-width: min(620px, 100%);
  color: color-mix(in srgb, var(--jpdb-newtab-surface-text, #15171c) 86%, var(--jpdb-newtab-accent-text, var(--jpdb-reader-accent)));
  font-size: clamp(17px, 2.4vw, 30px);
  font-weight: 800;
  line-height: 1.28;
  text-align: center;
  overflow-wrap: anywhere;
}

.jpdb-reader-newtab-concealed {
  min-height: 1.3em;
  color: color-mix(in srgb, var(--jpdb-newtab-surface-text, #15171c) 78%, transparent);
  font-size: clamp(15px, 1.8vw, 20px);
  font-weight: 800;
  text-align: center;
}

.jpdb-reader-newtab-kanji-mode .jpdb-reader-newtab-word {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-size: clamp(86px, 16vw, 210px);
}

.jpdb-reader-newtab-kanji-mode .jpdb-reader-newtab-visual {
  display: none;
}

.jpdb-reader-newtab-controls {
  min-height: 48px;
}

.jpdb-reader-newtab-status {
  min-width: 0;
  color: var(--jpdb-newtab-bg-text, #111);
  font-size: 13px;
  font-weight: 750;
  opacity: .86;
  text-align: right;
  overflow-wrap: anywhere;
}

.jpdb-reader-newtab-side {
  min-width: 0;
  display: grid;
  grid-template-rows: auto auto minmax(160px, 1fr) auto;
  gap: 12px;
}

.jpdb-reader-newtab-panel,
.jpdb-reader-newtab-source-note {
  border: 1px solid var(--jpdb-newtab-border, rgba(255,255,255,.55));
  border-radius: 14px;
  background: color-mix(in srgb, var(--jpdb-newtab-surface, #fff) 84%, transparent);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--jpdb-newtab-shadow, rgba(0,0,0,.16)) 62%, transparent);
}

.jpdb-reader-newtab-panel {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.jpdb-reader-newtab-panel-head {
  color: var(--jpdb-newtab-surface-text, #15171c);
  font-size: 12px;
  font-weight: 860;
  text-transform: uppercase;
}

.jpdb-reader-newtab-panel-head button {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--jpdb-newtab-surface-text, #15171c);
  font: inherit;
  text-transform: none;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.jpdb-reader-newtab-segmented,
.jpdb-reader-newtab-filter-grid {
  display: grid;
  gap: 8px;
}

.jpdb-reader-newtab-segmented {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.jpdb-reader-newtab-filter-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.jpdb-reader-newtab-segmented button,
.jpdb-reader-newtab-filter-grid button,
.jpdb-reader-newtab-list-item {
  min-height: 36px;
  border: 1px solid var(--jpdb-newtab-soft-border, rgba(0,0,0,.14));
  border-radius: 8px;
  background: var(--jpdb-newtab-surface-muted, rgba(0,0,0,.04));
  color: var(--jpdb-newtab-surface-text, #15171c);
  font-size: 13px;
  font-weight: 780;
  cursor: pointer;
}

.jpdb-reader-newtab-segmented button[data-active="true"],
.jpdb-reader-newtab-filter-grid button[data-active="true"],
.jpdb-reader-newtab-list-item.active {
  border-color: transparent;
  background: var(--jpdb-newtab-accent-text, var(--jpdb-reader-accent));
  color: var(--jpdb-newtab-surface, #fff);
}

.jpdb-reader-newtab-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.jpdb-reader-newtab-form-grid label,
.jpdb-reader-newtab-search {
  display: grid;
  gap: 5px;
  color: color-mix(in srgb, var(--jpdb-newtab-surface-text, #15171c) 70%, transparent);
  font-size: 12px;
  font-weight: 760;
}

.jpdb-reader-newtab select,
.jpdb-reader-newtab input {
  min-height: 38px;
  width: 100%;
  border: 1px solid var(--jpdb-newtab-soft-border, rgba(0,0,0,.14));
  border-radius: 8px;
  padding: 7px 9px;
  background: var(--jpdb-newtab-surface, #fff);
  color: var(--jpdb-newtab-surface-text, #15171c);
  font-size: 14px;
  font-weight: 680;
}

.jpdb-reader-newtab-queue-panel {
  min-height: 0;
}

.jpdb-reader-newtab-list {
  min-height: 0;
  max-height: 100%;
  display: grid;
  align-content: start;
  gap: 7px;
  overflow: auto;
  padding-right: 2px;
}

.jpdb-reader-newtab-list-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  text-align: left;
}

.jpdb-reader-newtab-list-item span,
.jpdb-reader-newtab-list-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jpdb-reader-newtab-list-item span {
  font-size: 18px;
  font-weight: 850;
}

.jpdb-reader-newtab-list-item small {
  font-size: 11px;
  font-weight: 780;
  opacity: .78;
}

.jpdb-reader-newtab-list-item.active small {
  opacity: 1;
}

.jpdb-reader-newtab-source-note {
  padding: 11px 13px;
  color: color-mix(in srgb, var(--jpdb-newtab-surface-text, #15171c) 72%, transparent);
  font-size: 12px;
  line-height: 1.4;
  font-weight: 680;
}

.jpdb-reader-newtab-source-note p {
  margin: 0;
}

.jpdb-reader-newtab-source-note p + p {
  margin-top: 6px;
}

.jpdb-reader-newtab-puck {
  position: fixed;
  right: max(16px, env(safe-area-inset-right));
  bottom: max(16px, env(safe-area-inset-bottom));
  z-index: 2147483641;
  border: 1px solid var(--jpdb-newtab-border, rgba(255,255,255,.55));
  cursor: pointer;
}

.jpdb-reader-newtab-empty {
  display: grid;
  gap: 14px;
  justify-items: center;
  padding: 34px;
  border: 4px dashed var(--jpdb-newtab-border, #fff);
  color: var(--jpdb-newtab-bg-text, #111);
  text-align: center;
}

.jpdb-reader-newtab-empty-title {
  font-size: clamp(30px, 7vw, 72px);
  line-height: 1;
  font-weight: 900;
}

.jpdb-reader-newtab-empty p {
  max-width: 560px;
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
  font-weight: 700;
}

@media (max-width: 980px) {
  .jpdb-reader-newtab-workspace {
    grid-template-columns: 1fr;
  }

  .jpdb-reader-newtab-side {
    grid-template-rows: auto auto auto auto;
  }

  .jpdb-reader-newtab-card {
    min-height: clamp(400px, 58dvh, 560px);
  }
}

@media (max-width: 700px) {
  .jpdb-reader-newtab-shell {
    width: min(100vw - 22px, 620px);
    gap: 12px;
  }

  .jpdb-reader-newtab-health {
    display: none;
  }

  .jpdb-reader-newtab-card {
    min-height: min(520px, calc(100dvh - 164px));
    padding: 18px;
  }

  .jpdb-reader-newtab-visual {
    width: 94px;
    height: 94px;
  }

  .jpdb-reader-newtab-word {
    font-size: clamp(44px, 15vw, 88px);
  }

  .jpdb-reader-newtab-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .jpdb-reader-newtab-status {
    grid-column: 1 / -1;
    text-align: left;
  }

  .jpdb-reader-newtab-form-grid,
  .jpdb-reader-newtab-filter-grid {
    grid-template-columns: 1fr;
  }
}

.jpdb-reader-word {
  position: relative;
  border-radius: 3px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  text-decoration-line: underline !important;
  text-decoration-style: solid !important;
  text-decoration-color: transparent !important;
  text-decoration-thickness: 2px !important;
  text-underline-offset: 3px !important;
  transition: background .12s ease, text-decoration-color .12s ease;
}

.jpdb-reader-word:hover,
.jpdb-reader-word:focus {
  background: var(--jpdb-reader-hover) !important;
  outline: none;
}

.jpdb-reader-word.jpdb-new,
.jpdb-reader-word.jpdb-suspended,
.jpdb-reader-word.jpdb-not-in-deck,
.jpdb-reader-word.anki-new,
.jpdb-reader-word.anki-suspended {
  background: var(--jpdb-reader-state-new-soft, rgba(88,166,255,.16)) !important;
  text-decoration-color: var(--jpdb-reader-state-new, #58a6ff) !important;
}
.jpdb-reader-word.jpdb-learning,
.jpdb-reader-word.anki-learning {
  background: var(--jpdb-reader-state-learning-soft, rgba(255,209,102,.16)) !important;
  text-decoration-color: var(--jpdb-reader-state-learning, #ffd166) !important;
}
.jpdb-reader-word.jpdb-known,
.jpdb-reader-word.jpdb-never-forget,
.jpdb-reader-word.jpdb-redundant,
.jpdb-reader-word.anki-known {
  background: transparent !important;
  text-decoration-color: var(--jpdb-reader-state-known, #7bd88f) !important;
}
.jpdb-reader-word.jpdb-due,
.jpdb-reader-word.anki-due {
  background: var(--jpdb-reader-state-due-soft, rgba(255,180,84,.16)) !important;
  text-decoration-color: var(--jpdb-reader-state-due, #ffb454) !important;
}
.jpdb-reader-word.jpdb-failed,
.jpdb-reader-word.anki-failed {
  background: var(--jpdb-reader-state-failed-soft, rgba(255,107,107,.16)) !important;
  text-decoration-color: var(--jpdb-reader-state-failed, #ff6b6b) !important;
}
.jpdb-reader-word.jpdb-blacklisted,
.jpdb-reader-word.jpdb-locked {
  background: var(--jpdb-reader-state-ignored-soft, rgba(184,167,255,.16)) !important;
  text-decoration-color: var(--jpdb-reader-state-ignored, #b8a7ff) !important;
  opacity: .82 !important;
}
.jpdb-reader-highlight-pitch .jpdb-reader-word {
  background: transparent !important;
  text-decoration-color: rgba(148,163,184,.72) !important;
  opacity: 1 !important;
}
.jpdb-reader-highlight-pitch .jpdb-reader-word.jpdb-pitch-heiban {
  background: rgba(53,158,255,.14) !important;
  text-decoration-color: #359eff !important;
}
.jpdb-reader-highlight-pitch .jpdb-reader-word.jpdb-pitch-atamadaka {
  background: rgba(254,75,116,.14) !important;
  text-decoration-color: #fe4b74 !important;
}
.jpdb-reader-highlight-pitch .jpdb-reader-word.jpdb-pitch-nakadaka {
  background: rgba(251,168,64,.16) !important;
  text-decoration-color: #fba840 !important;
}
.jpdb-reader-highlight-pitch .jpdb-reader-word.jpdb-pitch-odaka {
  background: rgba(87,204,183,.14) !important;
  text-decoration-color: #57ccb7 !important;
}
.jpdb-reader-highlight-pitch .jpdb-reader-word.jpdb-pitch-kifuku {
  background: rgba(144,80,246,.14) !important;
  text-decoration-color: #9050f6 !important;
}
.jpdb-reader-highlight-off .jpdb-reader-word,
.jpdb-reader-highlight-off .jpdb-reader-word:is(:hover,:focus,.jpdb-reader-hover) {
  background: transparent !important;
  box-shadow: none !important;
  opacity: 1 !important;
  text-decoration-color: transparent !important;
}
.jpdb-reader-newtab-word .jpdb-reader-word {
  background: transparent !important;
  color: inherit !important;
  text-decoration-color: transparent !important;
}
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
  text-decoration: none !important;
  color: inherit !important;
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
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-suspended,
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-not-in-deck { color: var(--jpdb-reader-state-new, #58a6ff) !important; }
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-learning { color: var(--jpdb-reader-state-learning, #ffd166) !important; }
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-known,
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-never-forget,
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-redundant { color: var(--jpdb-reader-state-known, #7bd88f) !important; }
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-due { color: var(--jpdb-reader-state-due, #ffb454) !important; }
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-failed { color: var(--jpdb-reader-state-failed, #ff6b6b) !important; }
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-blacklisted,
.jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-locked { color: var(--jpdb-reader-state-ignored, #b8a7ff) !important; }
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
  text-decoration: none !important;
}
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-new,
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-suspended,
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-not-in-deck { color: var(--jpdb-reader-state-new, #58a6ff) !important; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-learning { color: var(--jpdb-reader-state-learning, #ffd166) !important; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-known,
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-never-forget,
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-redundant { color: var(--jpdb-reader-state-known, #7bd88f) !important; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-due { color: var(--jpdb-reader-state-due, #ffb454) !important; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-failed { color: var(--jpdb-reader-state-failed, #ff6b6b) !important; }
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-blacklisted,
.asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-locked { color: var(--jpdb-reader-state-ignored, #b8a7ff) !important; }
.jpdb-reader-highlight-pitch .jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word,
.jpdb-reader-highlight-pitch .asbplayer-subtitles-container-bottom .jpdb-reader-word,
.jpdb-reader-highlight-pitch .jpdb-subtitle-primary .jpdb-reader-word {
  color: inherit !important;
}
.jpdb-reader-highlight-pitch .jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-pitch-heiban,
.jpdb-reader-highlight-pitch .asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-pitch-heiban,
.jpdb-reader-highlight-pitch .jpdb-subtitle-primary .jpdb-reader-word.jpdb-pitch-heiban { color: #359eff !important; }
.jpdb-reader-highlight-pitch .jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-pitch-atamadaka,
.jpdb-reader-highlight-pitch .asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-pitch-atamadaka,
.jpdb-reader-highlight-pitch .jpdb-subtitle-primary .jpdb-reader-word.jpdb-pitch-atamadaka { color: #fe4b74 !important; }
.jpdb-reader-highlight-pitch .jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-pitch-nakadaka,
.jpdb-reader-highlight-pitch .asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-pitch-nakadaka,
.jpdb-reader-highlight-pitch .jpdb-subtitle-primary .jpdb-reader-word.jpdb-pitch-nakadaka { color: #fba840 !important; }
.jpdb-reader-highlight-pitch .jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-pitch-odaka,
.jpdb-reader-highlight-pitch .asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-pitch-odaka,
.jpdb-reader-highlight-pitch .jpdb-subtitle-primary .jpdb-reader-word.jpdb-pitch-odaka { color: #57ccb7 !important; }
.jpdb-reader-highlight-pitch .jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word.jpdb-pitch-kifuku,
.jpdb-reader-highlight-pitch .asbplayer-subtitles-container-bottom .jpdb-reader-word.jpdb-pitch-kifuku,
.jpdb-reader-highlight-pitch .jpdb-subtitle-primary .jpdb-reader-word.jpdb-pitch-kifuku { color: #9050f6 !important; }
.jpdb-reader-highlight-off .jpdb-ocr-line:is(:hover,:focus,.jpdb-ocr-line-active) .jpdb-reader-word,
.jpdb-reader-highlight-off .asbplayer-subtitles-container-bottom .jpdb-reader-word,
.jpdb-reader-highlight-off .jpdb-subtitle-primary .jpdb-reader-word {
  background: transparent !important;
  color: inherit !important;
  text-decoration-color: transparent !important;
}

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
  background: rgba(12,16,22,.74);
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
  align-self: center;
  gap: 4px;
  box-sizing: border-box;
  width: auto !important;
  min-width: 0 !important;
  max-width: max-content !important;
  height: auto !important;
  min-height: 24px !important;
  max-height: 28px !important;
  padding: 2px 8px !important;
  border: 1px solid currentColor;
  border-radius: 999px;
  color: var(--jpdb-reader-accent-readable) !important;
  background: var(--jpdb-reader-accent-soft);
  font-size: 10px;
  font-weight: 850;
  line-height: 1 !important;
  text-decoration: none;
  transform: translateY(1px);
}
button.jpdb-reader-jpdb-pill {
  cursor: pointer;
  font-family: inherit;
}
.jpdb-reader-jpdb-pill:hover,
.jpdb-reader-jpdb-pill:focus-visible {
  background: var(--jpdb-reader-hover);
  outline: 2px solid var(--jpdb-reader-accent-soft);
}
.jpdb-reader-jpdb-pill svg {
  width: 12px !important;
  height: 12px !important;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.jpdb-reader-lookup-pills {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.jpdb-reader-reading,
.jpdb-reader-pos,
.jpdb-reader-meta,
.jpdb-reader-help {
  color: var(--jpdb-reader-muted);
}

.jpdb-reader-reading { margin-top: 2px; font-size: 15px; }
.jpdb-reader-pos { margin-top: 7px; font-size: 12px; line-height: 1.35; }
.jpdb-reader-status-line { min-height: 22px; }
.jpdb-reader-status-line[data-status-tone] {
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-text);
}
.jpdb-reader-status-line[data-status-tone="pending"] {
  color: var(--jpdb-reader-muted);
}
.jpdb-reader-status-line[data-status-tone="success"] {
  border-color: color-mix(in srgb, var(--jpdb-reader-accent) 52%, var(--jpdb-reader-border));
  background: color-mix(in srgb, var(--jpdb-reader-accent) 11%, var(--jpdb-reader-surface-2));
  color: var(--jpdb-reader-accent);
}
.jpdb-reader-status-line[data-status-tone="error"] {
  border-color: color-mix(in srgb, #e55353 52%, var(--jpdb-reader-border));
  background: color-mix(in srgb, #e55353 11%, var(--jpdb-reader-surface-2));
  color: #ff8c8c;
}
.jpdb-reader-meanings { margin: 9px 0; display: grid; gap: 5px; }
.jpdb-reader-meaning { color: var(--jpdb-reader-text); line-height: 1.35; }
.jpdb-reader-meaning-pos { color: var(--jpdb-reader-faint); font-size: 11px; margin-right: 5px; font-style: italic; text-transform: none; }
.jpdb-reader-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 12px; }
.jpdb-reader-inline-link { color: var(--jpdb-reader-accent); font-weight: 800; text-decoration: none; }
.jpdb-reader-state-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; background: var(--jpdb-reader-faint); margin-right: 4px; }
.jpdb-reader-state-dot.jpdb-new,
.jpdb-reader-state-dot.jpdb-suspended,
.jpdb-reader-state-dot.jpdb-not-in-deck { background: var(--jpdb-reader-state-new, #58a6ff); }
.jpdb-reader-state-dot.jpdb-learning { background: var(--jpdb-reader-state-learning, #ffd166); }
.jpdb-reader-state-dot.jpdb-known,
.jpdb-reader-state-dot.jpdb-never-forget,
.jpdb-reader-state-dot.jpdb-redundant { background: var(--jpdb-reader-state-known, #7bd88f); }
.jpdb-reader-state-dot.jpdb-due { background: var(--jpdb-reader-state-due, #ffb454); }
.jpdb-reader-state-dot.jpdb-failed { background: var(--jpdb-reader-state-failed, #ff6b6b); }
.jpdb-reader-state-dot.jpdb-blacklisted,
.jpdb-reader-state-dot.jpdb-locked { background: var(--jpdb-reader-state-ignored, #b8a7ff); }

.jpdb-reader-local {
  border-top: 1px solid var(--jpdb-reader-border);
  margin-top: 12px;
  padding-top: 12px;
  display: grid;
  gap: 8px;
}
.jpdb-reader-definition-stack {
  display: grid;
  gap: 0;
  margin-top: 12px;
}
.jpdb-reader-definition-stack .jpdb-reader-local {
  margin-top: 0;
}
.jpdb-reader-source-card,
.jpdb-reader-study-source {
  gap: 0;
  padding-top: 0;
}
.jpdb-reader-source-card .jpdb-reader-meanings {
  margin: 0;
}
.jpdb-reader-source-card > summary.jpdb-reader-local-title,
.jpdb-reader-study-source > summary.jpdb-reader-local-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  padding: 10px 0;
  cursor: pointer;
  list-style: none;
}
.jpdb-reader-source-card > summary.jpdb-reader-local-title::-webkit-details-marker,
.jpdb-reader-study-source > summary.jpdb-reader-local-title::-webkit-details-marker {
  display: none;
}
.jpdb-reader-source-card > summary.jpdb-reader-local-title::after,
.jpdb-reader-study-source > summary.jpdb-reader-local-title::after {
  content: "+";
  margin-left: auto;
  color: var(--jpdb-reader-muted);
  font-size: 18px;
  line-height: 1;
}
.jpdb-reader-source-card[open] > summary.jpdb-reader-local-title::after,
.jpdb-reader-study-source[open] > summary.jpdb-reader-local-title::after {
  content: "-";
}
.jpdb-reader-source-card[data-immersion-empty="true"] > summary.jpdb-reader-local-title {
  cursor: default;
}
.jpdb-reader-source-card[data-immersion-empty="true"] > summary.jpdb-reader-local-title::after {
  content: "";
}
.jpdb-reader-source-card > :not(summary) {
  margin-left: 0;
  margin-right: 0;
}
.jpdb-reader-source-card[open] > :last-child {
  margin-bottom: 12px;
}
.jpdb-reader-study-source > .jpdb-reader-study-panel {
  margin-bottom: 12px;
}
.jpdb-reader-local-title {
  color: var(--jpdb-reader-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}
.jpdb-reader-source-status {
  margin-left: auto;
  color: var(--jpdb-reader-faint);
  font-size: 11px;
  font-weight: 700;
  text-transform: none;
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
  --font-size-no-units: 13;
  --line-height: 1.45;
  --list-padding1: 1.1em;
  --list-padding2: 1.45em;
  --compact-list-separator: " / ";
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
.jpdb-reader-dictionary-group {
  padding: 0;
  overflow: hidden;
}
.jpdb-reader-dictionary-group > summary.jpdb-reader-local-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  cursor: pointer;
  list-style: none;
}
.jpdb-reader-dictionary-group > summary.jpdb-reader-local-head::-webkit-details-marker {
  display: none;
}
.jpdb-reader-dictionary-group > summary.jpdb-reader-local-head::after {
  content: "+";
  margin-left: 4px;
  color: var(--jpdb-reader-muted);
  font-size: 16px;
  line-height: 1;
}
.jpdb-reader-dictionary-group[open] > summary.jpdb-reader-local-head::after {
  content: "-";
}
.jpdb-reader-dictionary-group > .jpdb-reader-local-glossary {
  padding: 0 8px 8px;
}
.jpdb-reader-local-glossary .structured-content {
  display: inline;
  white-space: normal;
  line-height: var(--line-height);
}
.jpdb-reader-local-glossary :is(.gloss-sc-div, .gloss-sc-ul, .gloss-sc-ol, .gloss-sc-li, .gloss-sc-details) {
  white-space: normal;
}
.jpdb-reader-local-glossary .gloss-sc-ul,
.jpdb-reader-local-glossary .gloss-sc-ol {
  margin: 0.25em 0 0.25em var(--list-padding1);
  padding: 0;
}
.jpdb-reader-local-glossary .gloss-sc-ul[data-sc-content="glossary"],
.jpdb-reader-local-glossary .gloss-sc-ol[data-sc-content="glossary"] {
  display: grid;
  gap: 0.25em;
}
.jpdb-reader-local-glossary .gloss-sc-li {
  margin: 0;
  padding-left: 0.1em;
}
.jpdb-reader-local-glossary .gloss-sc-li > .gloss-sc-ul,
.jpdb-reader-local-glossary .gloss-sc-li > .gloss-sc-ol {
  margin-left: var(--list-padding2);
}
.jpdb-reader-local-glossary .gloss-sc-details {
  margin: 0.35em 0;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--jpdb-reader-surface-2) 72%, transparent);
}
.jpdb-reader-local-glossary .gloss-sc-summary {
  padding: 0.35em 0.55em;
  cursor: pointer;
  font-weight: 700;
}
.jpdb-reader-local-glossary .gloss-sc-details > :not(.gloss-sc-summary) {
  padding: 0 0.55em 0.45em;
}
.jpdb-reader-local-glossary .gloss-sc-table-container {
  display: block;
  max-width: 100%;
  margin: 0.35em 0;
  overflow-x: auto;
  white-space: normal;
}
.jpdb-reader-local-glossary .gloss-sc-table {
  width: auto;
  min-width: min(100%, 24rem);
  border-collapse: collapse;
  table-layout: auto;
}
.jpdb-reader-local-glossary .gloss-sc-th,
.jpdb-reader-local-glossary .gloss-sc-td {
  border: 1px solid var(--jpdb-reader-border);
  padding: 0.35em 0.45em;
  vertical-align: top;
}
.jpdb-reader-local-glossary .gloss-sc-th {
  background: var(--jpdb-reader-surface-2);
  font-weight: 800;
}
.jpdb-reader-local-glossary .gloss-link {
  color: var(--jpdb-reader-accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}
.jpdb-reader-local-glossary .gloss-link-external-icon {
  display: none;
}
.jpdb-reader-local-glossary [data-sc-content="part-of-speech-info"],
.jpdb-reader-local-glossary [data-sc-class="tag"],
.jpdb-reader-local-glossary [data-sc-class="pitch-accent-position"] {
  display: inline-flex;
  align-items: center;
  min-height: 1.4em;
  margin: 0 0.25em 0.15em 0;
  padding: 0.05em 0.35em;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 999px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-muted);
  font-size: 0.88em;
  font-weight: 700;
  white-space: nowrap;
}
.jpdb-reader-local-glossary .gloss-image-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  max-width: 100%;
  margin: 0.15em 0;
  color: var(--jpdb-reader-muted);
  vertical-align: middle;
}
.jpdb-reader-local-glossary .gloss-image-container {
  position: relative;
  display: inline-block;
  max-width: min(100%, 20rem);
  min-width: 3rem;
  overflow: hidden;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 6px;
  background: var(--jpdb-reader-surface-2);
  vertical-align: middle;
}
.jpdb-reader-local-glossary .gloss-image-sizer {
  display: block;
}
.jpdb-reader-local-glossary .gloss-image-background,
.jpdb-reader-local-glossary .gloss-image-container-overlay {
  position: absolute;
  inset: 0;
}
.jpdb-reader-local-glossary .gloss-image-background {
  background:
    linear-gradient(45deg, rgba(255,255,255,.06) 25%, transparent 25% 75%, rgba(255,255,255,.06) 75%),
    linear-gradient(45deg, rgba(255,255,255,.06) 25%, transparent 25% 75%, rgba(255,255,255,.06) 75%);
  background-position: 0 0, 6px 6px;
  background-size: 12px 12px;
}
.jpdb-reader-local-glossary .gloss-image-link-text,
.jpdb-reader-local-glossary .gloss-image-description {
  color: var(--jpdb-reader-muted);
  font-size: 0.9em;
}
.jpdb-reader-anki-existing {
  margin-top: 12px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  overflow: hidden;
}
.jpdb-reader-anki-existing summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px;
  cursor: pointer;
  color: var(--jpdb-reader-text);
  font-size: 12px;
  font-weight: 800;
  list-style: none;
}
.jpdb-reader-anki-existing summary::-webkit-details-marker { display: none; }
.jpdb-reader-anki-existing summary small {
  color: var(--jpdb-reader-muted);
  font-weight: 600;
  text-align: right;
}
.jpdb-reader-anki-card-preview {
  border-top: 1px solid var(--jpdb-reader-border);
  padding: 9px 10px 10px;
  display: grid;
  gap: 8px;
  color: var(--jpdb-reader-muted);
  font-size: 12px;
  line-height: 1.35;
}
.jpdb-reader-anki-card-preview div {
  display: grid;
  gap: 2px;
}
.jpdb-reader-anki-card-preview strong {
  color: var(--jpdb-reader-text);
  font-size: 11px;
  text-transform: uppercase;
}
.jpdb-reader-anki-card-preview span,
.jpdb-reader-anki-card-preview small {
  white-space: pre-wrap;
}

.yomu-jpdb-addon-card {
  display: grid;
  gap: 9px;
  margin: 14px 0;
  padding: 11px 12px;
  border: 1px solid var(--jpdb-reader-border, rgba(127,137,152,.20));
  border-radius: 8px;
  background: color-mix(in srgb, var(--jpdb-reader-surface, Canvas) 92%, transparent);
  color: var(--jpdb-reader-text, inherit);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.42;
  box-shadow: 0 1px 0 color-mix(in srgb, var(--jpdb-reader-border, rgba(127,137,152,.18)) 70%, transparent);
}
.yomu-jpdb-addon-card,
.yomu-jpdb-addon-card * {
  box-sizing: border-box;
}
.yomu-jpdb-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--jpdb-reader-muted);
  font-size: 11px;
  font-weight: 850;
  text-transform: uppercase;
}
.yomu-jpdb-card-title a {
  color: var(--jpdb-reader-accent);
  font-size: 11px;
  font-weight: 800;
  text-decoration: none;
  text-transform: none;
}
.yomu-jpdb-collapsible-card {
  display: grid;
  gap: 9px;
}
.yomu-jpdb-collapsible-card > summary {
  cursor: pointer;
  list-style: none;
}
.yomu-jpdb-collapsible-card > summary::-webkit-details-marker {
  display: none;
}
.yomu-jpdb-collapsible-card > summary::after {
  content: "Show";
  color: var(--jpdb-reader-accent);
  font-size: 11px;
  font-weight: 800;
  text-transform: none;
}
.yomu-jpdb-collapsible-card[open] > summary::after {
  content: "Hide";
}
.yomu-jpdb-collapsible-body {
  display: grid;
  gap: 9px;
}
.yomu-jpdb-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex-wrap: wrap;
}
.yomu-jpdb-counter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 24px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-muted);
  font-size: 11px;
  font-weight: 800;
}
.yomu-jpdb-image-shell {
  display: grid;
  place-items: center;
}
.yomu-jpdb-image-shell img {
  display: block;
  width: min(320px, 100%);
  max-height: 340px;
  object-fit: contain;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-bg);
}
.yomu-jpdb-story {
  max-width: 58ch;
  margin: 0 auto;
  color: var(--jpdb-reader-text);
  white-space: pre-wrap;
}
.yomu-jpdb-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 7px;
}
.yomu-jpdb-facts span {
  display: grid;
  gap: 2px;
  padding: 8px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface-2);
}
.yomu-jpdb-facts strong,
.yomu-jpdb-addon-card h6 {
  color: var(--jpdb-reader-muted);
  font-size: 10px;
  font-weight: 850;
  text-transform: uppercase;
}
.yomu-jpdb-addon-card h6,
.yomu-jpdb-addon-card p {
  margin: 0;
}
.yomu-jpdb-addon-card section {
  display: grid;
  gap: 5px;
}
.yomu-jpdb-chip-row,
.yomu-jpdb-component-row,
.yomu-jpdb-used-words {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.yomu-jpdb-chip-row span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 27px;
  padding: 3px 8px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 999px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-text);
  font-weight: 750;
}
.yomu-jpdb-chip-row span.common {
  border-color: color-mix(in srgb, var(--jpdb-reader-accent) 45%, var(--jpdb-reader-border));
  background: var(--jpdb-reader-accent-soft);
}
.yomu-jpdb-chip-row small {
  color: var(--jpdb-reader-muted);
  font-size: 11px;
}
.yomu-jpdb-component,
.yomu-jpdb-used-words a {
  display: inline-grid;
  gap: 1px;
  min-width: 70px;
  padding: 7px 9px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface-2);
  color: var(--jpdb-reader-text) !important;
  text-decoration: none !important;
}
.yomu-jpdb-component:hover,
.yomu-jpdb-component:focus-visible,
.yomu-jpdb-used-words a:hover,
.yomu-jpdb-used-words a:focus-visible {
  border-color: var(--jpdb-reader-accent);
  outline: none;
}
.yomu-jpdb-component strong {
  color: var(--jpdb-reader-text);
  font-size: 22px;
  line-height: 1;
}
.yomu-jpdb-component span,
.yomu-jpdb-used-words small {
  color: var(--jpdb-reader-muted);
  font-size: 11px;
  line-height: 1.25;
}
.yomu-jpdb-used-words a span {
  font-weight: 800;
}
.yomu-jpdb-local-dictionaries .jpdb-reader-local-entry {
  background: var(--jpdb-reader-surface-2);
}
.yomu-jpdb-local-dictionaries {
  gap: 7px;
}
.yomu-jpdb-local-dictionaries .jpdb-reader-dictionary-group {
  border-radius: 8px;
}
.yomu-jpdb-local-dictionaries .jpdb-reader-local-head {
  min-height: 38px;
}
.yomu-jpdb-local-dictionaries .jpdb-reader-local-glossary {
  line-height: 1.45;
}
.yomu-jpdb-audio-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 24px;
  margin-left: 6px;
  padding: 2px 7px;
  border: 1px solid var(--jpdb-reader-border, rgba(127,137,152,.35));
  border-radius: 999px;
  background: var(--jpdb-reader-accent-soft, rgba(94,167,128,.16));
  color: var(--jpdb-reader-accent, currentColor);
  cursor: pointer;
  font: 800 10px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  vertical-align: middle;
  -webkit-tap-highlight-color: transparent;
}
.yomu-jpdb-audio-button:hover,
.yomu-jpdb-audio-button:focus-visible {
  border-color: var(--jpdb-reader-accent, currentColor);
  outline: none;
}
.yomu-jpdb-audio-button svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.yomu-jpdb-review-compact-nav .menu .nav-item:not(:first-child),
.yomu-jpdb-review-compact-nav .menu-icon {
  display: none !important;
}
.yomu-jpdb-review-compact-nav .menu {
  max-height: 32px !important;
  transition: none !important;
}
.yomu-jpdb-items-left-count {
  color: #e5484d;
}
#yomu-jpdb-doodle-root {
  display: grid;
  place-items: center;
  gap: 10px;
  width: min(100%, 320px);
  margin: 14px auto 8px;
  padding: 10px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--jpdb-reader-surface, Canvas) 88%, transparent);
  color: var(--jpdb-reader-text);
}
.yomu-doodle-stage {
  position: relative;
  width: min(76vw, 230px);
  aspect-ratio: 1;
  touch-action: none;
}
.yomu-doodle-canvas,
.yomu-doodle-ghost {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.yomu-doodle-canvas {
  z-index: 1;
  border: 2px solid color-mix(in srgb, var(--jpdb-reader-text) 82%, var(--jpdb-reader-border));
  border-radius: 8px;
  cursor: crosshair;
  touch-action: none;
  background:
    linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px),
    linear-gradient(0deg, rgba(255,255,255,.06) 1px, transparent 1px);
  background-size: 25% 25%;
}
.yomu-doodle-ghost {
  z-index: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: var(--jpdb-reader-accent);
  font-size: min(72vw, 320px);
  line-height: 1;
  opacity: .26;
  pointer-events: none;
}
.yomu-doodle-ghost svg {
  width: 100%;
  height: 100%;
}
.yomu-doodle-ghost path,
.yomu-doodle-ghost line,
.yomu-doodle-ghost polyline {
  fill: none !important;
  stroke: currentColor !important;
  stroke-width: 2.8 !important;
  stroke-linecap: round !important;
  stroke-linejoin: round !important;
}
#yomu-jpdb-doodle-preview {
  display: inline-grid;
  place-items: center;
  gap: 5px;
  min-width: 132px;
  margin-left: 14px;
  padding: 8px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--jpdb-reader-surface, Canvas) 90%, transparent);
  vertical-align: top;
}
.yomu-doodle-preview-label {
  color: var(--jpdb-reader-muted);
  font-size: 10px;
  font-weight: 850;
  line-height: 1;
  text-transform: uppercase;
}
#yomu-jpdb-doodle-preview img {
  width: min(180px, 30vw);
  height: auto;
  border-radius: 8px;
  border: 1px solid var(--jpdb-reader-border);
  background: var(--jpdb-reader-bg);
}
#yomu-jpdb-doodle-root .jpdb-reader-btn {
  min-height: 44px;
  padding-inline: 14px;
}
@media (min-height: 960px) and (min-width: 700px) {
  #yomu-jpdb-doodle-root {
    width: min(100%, 410px);
  }
  #yomu-jpdb-doodle-root .yomu-doodle-stage {
    width: min(78vw, 320px);
  }
}
.jpdb-reader-settings-subsection {
  display: grid;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--jpdb-reader-border);
}
.jpdb-reader-example-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  align-items: stretch;
  padding: 9px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
}
.jpdb-reader-example-card.has-image {
  grid-template-columns: minmax(0, 92px) minmax(0, 1fr);
}
.jpdb-reader-example-image {
  width: 92px;
  height: 82px;
  object-fit: cover;
  border-radius: 6px;
  background: var(--jpdb-reader-surface-2);
}
.jpdb-reader-example-body {
  display: grid;
  align-content: start;
  gap: 7px;
  min-width: 0;
}
.jpdb-reader-example-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  grid-template-areas:
    "source count actions"
    "query query actions";
  align-items: center;
  gap: 6px 9px;
  color: var(--jpdb-reader-muted);
  font-size: 11px;
  font-weight: 750;
}
.jpdb-reader-example-source {
  grid-area: source;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jpdb-reader-example-query {
  grid-area: query;
  justify-self: start;
  max-width: 120px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--jpdb-reader-accent) 46%, var(--jpdb-reader-border));
  border-radius: 999px;
  padding: 2px 7px;
  color: var(--jpdb-reader-accent);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jpdb-reader-example-count {
  grid-area: count;
  align-self: center;
  color: var(--jpdb-reader-muted);
  font-size: 13px;
  font-weight: 850;
  line-height: 1;
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
  grid-area: actions;
  align-self: center;
  display: inline-grid;
  grid-template-columns: repeat(3, 30px);
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--jpdb-reader-surface-2) 84%, transparent);
}
.jpdb-reader-example-actions .jpdb-reader-icon-mini {
  width: 30px !important;
  min-width: 30px !important;
  max-width: 30px !important;
  height: 30px !important;
  min-height: 30px !important;
  max-height: 30px !important;
  border-radius: 6px;
  background: rgba(255,255,255,.025);
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
@media (max-width: 520px) {
  .jpdb-reader-example-card.has-image {
    grid-template-columns: minmax(0, 72px) minmax(0, 1fr);
  }
  .jpdb-reader-example-image {
    width: 72px;
    height: 64px;
  }
  .jpdb-reader-example-meta {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "source actions"
      "count actions"
      "query query";
  }
  .jpdb-reader-example-query {
    max-width: 100%;
  }
  .jpdb-reader-example-actions {
    grid-template-columns: repeat(3, 28px);
  }
}
.jpdb-reader-media-note { color: var(--jpdb-reader-muted); font-style: italic; }
.jpdb-reader-study-tools {
  display: grid;
  gap: 8px;
  margin: 10px 0;
}
.jpdb-reader-study-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.jpdb-reader-study-actions .jpdb-reader-icon-mini {
  width: auto;
  min-width: 76px;
  padding: 0 10px;
}
.jpdb-reader-study-panel {
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  padding: 10px;
  color: var(--jpdb-reader-text);
  font-size: 13px;
  line-height: 1.45;
}
.jpdb-reader-study-original {
  margin-bottom: 10px;
}
.jpdb-reader-study-title,
.jpdb-reader-study-name {
  color: var(--jpdb-reader-text);
  font-weight: 800;
}
.jpdb-reader-study-note,
.jpdb-reader-study-match {
  color: var(--jpdb-reader-faint);
  font-size: 11px;
}
.jpdb-reader-study-item {
  display: grid;
  grid-template-columns: minmax(56px, auto) minmax(0, 1fr) auto;
  gap: 8px;
  align-items: baseline;
  margin-top: 7px;
}
.jpdb-reader-study-item:first-of-type { margin-top: 4px; }
.jpdb-reader-study-short,
.jpdb-reader-study-empty {
  color: var(--jpdb-reader-muted);
}
.jpdb-reader-template-preview {
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface);
  padding: 10px;
  margin-top: 10px;
}
.jpdb-reader-template-preview-title {
  color: var(--jpdb-reader-text);
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 8px;
}
.jpdb-reader-template-preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.jpdb-reader-template-preview-grid > div {
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 8px;
  background: var(--jpdb-reader-surface-2);
  padding: 10px;
  min-height: 118px;
}
.jpdb-reader-template-preview strong,
.jpdb-reader-template-preview small {
  display: block;
  color: var(--jpdb-reader-muted);
}
.jpdb-reader-template-expression {
  color: var(--jpdb-reader-text);
  font-size: 24px;
  font-weight: 850;
  line-height: 1.1;
  margin-top: 8px;
}
.jpdb-reader-template-reading,
.jpdb-reader-template-meaning {
  color: var(--jpdb-reader-muted);
  margin-top: 4px;
}
.jpdb-reader-template-sentence {
  color: var(--jpdb-reader-text);
  font-size: 18px;
  line-height: 1.35;
  margin: 10px 0 8px;
}
.jpdb-reader-template-sentence span {
  color: var(--jpdb-reader-accent);
  font-weight: 850;
}
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
.jpdb-reader-modal-nav,
.jpdb-reader-kanji-nav {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  color: var(--jpdb-reader-muted);
  font-size: 12px;
  font-weight: 750;
}
.jpdb-reader-modal-nav span,
.jpdb-reader-kanji-nav span {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jpdb-reader-kanji-display {
  color: var(--jpdb-reader-text);
  font-size: 46px;
  font-weight: 850;
  line-height: 1;
}
.jpdb-reader-kanji-title-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px 12px;
  width: 100%;
}
.jpdb-reader-kanji-title-row [data-kanji-keyword-mount] {
  min-width: 0;
}
.jpdb-reader-kanji-title-row .jpdb-reader-lookup-pills {
  justify-self: end;
}
.jpdb-reader-kanji-keywords {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.jpdb-reader-kanji-keyword {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  min-height: 28px;
  padding: 3px 11px 3px 7px;
  border: 1px solid color-mix(in srgb, var(--jpdb-reader-accent) 46%, var(--jpdb-reader-border));
  border-radius: 999px;
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--jpdb-reader-accent) 16%, transparent),
      color-mix(in srgb, var(--jpdb-reader-accent) 9%, transparent));
  color: var(--jpdb-reader-text);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
  font-size: 13px;
  font-weight: 850;
  line-height: 1.08;
  overflow: hidden;
  white-space: nowrap;
}
.jpdb-reader-kanji-keyword small {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--jpdb-reader-accent) 18%, transparent);
  color: color-mix(in srgb, var(--jpdb-reader-accent) 76%, var(--jpdb-reader-text));
  font-size: 9px;
  font-weight: 900;
  line-height: 18px;
  letter-spacing: 0;
  text-transform: uppercase;
}
.jpdb-reader-kanji-keyword span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
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
  grid-template-columns: auto minmax(0, 1fr);
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
  width: 48px;
  height: 48px;
  object-fit: contain;
  border-radius: 6px;
  background: color-mix(in srgb, var(--jpdb-reader-text) 92%, white);
}
.jpdb-reader-radical-frames {
  display: flex !important;
  flex-flow: row wrap;
  gap: 5px !important;
  margin-top: 5px;
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
  height: min(240px, 58vw);
  min-height: 190px;
  margin-top: 8px;
  border: 1px solid color-mix(in srgb, var(--jpdb-reader-border) 70%, #000);
  border-radius: 8px;
  background: #11171d;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.035), inset 0 -18px 44px rgba(0,0,0,.18);
  overflow: hidden;
}
.jpdb-reader-origin-graph-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.jpdb-reader-origin-graph-lines .jpdb-reader-origin-edge {
  fill: none;
  stroke: rgba(242,244,248,.78);
  stroke-width: 1.35;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.jpdb-reader-origin-graph-lines .jpdb-reader-origin-edge-arrow {
  fill: rgba(242,244,248,.82);
}
.jpdb-reader-origin-graph-lines .jpdb-reader-origin-edge-particle {
  fill: rgba(242,244,248,.94);
  stroke: #11171d;
  stroke-width: .12;
}
.jpdb-reader-origin-graph-wrap:not(.show-outbound) [data-origin-outbound="true"] {
  display: none;
}
.jpdb-reader-origin-graph-toggle {
  position: absolute;
  top: 7px;
  right: 7px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: calc(100% - 14px);
  padding: 4px 7px;
  border: 1px solid rgba(242,244,248,.18);
  border-radius: 999px;
  background: rgba(3,7,11,.74);
  color: rgba(242,244,248,.9);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.1;
  cursor: pointer;
  user-select: none;
  box-shadow: 0 8px 20px rgba(0,0,0,.24);
}
.jpdb-reader-origin-graph-toggle input {
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: #7dc3e5;
}
.jpdb-reader-origin-graph-node {
  position: absolute;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  width: 62px;
  min-width: 62px;
  height: 62px;
  padding: 0;
  border: 4px solid #03070b;
  border-radius: 999px;
  background: #7dc3e5;
  color: #03070b;
  font: 850 32px/1 "Hiragino Sans", "Yu Gothic", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  box-shadow: 0 9px 26px rgba(0,0,0,.34);
  cursor: grab;
  touch-action: none;
  user-select: none;
  z-index: 1;
  transition: border-color .14s ease, box-shadow .14s ease, color .14s ease, transform .14s ease;
}
.jpdb-reader-origin-graph-node.current {
  width: 68px;
  min-width: 68px;
  height: 68px;
  border-color: #03070b;
  background: #2fa6dc;
  font-size: 34px;
  box-shadow: 0 12px 32px rgba(0,0,0,.4);
}
.jpdb-reader-origin-graph-node.component {
  border-color: #03070b;
}
.jpdb-reader-origin-graph-node.related {
  background: #f4f7fb;
  color: #03070b;
  font-size: 22px;
}
.jpdb-reader-origin-graph-node:hover,
.jpdb-reader-origin-graph-node:focus-visible {
  border-color: #03070b;
  box-shadow: 0 14px 34px rgba(0,0,0,.44), 0 0 0 3px rgba(125,195,229,.16);
  outline: none;
  transform: translate(-50%, -50%) scale(1.04);
}
.jpdb-reader-origin-graph-node.dragging {
  cursor: grabbing;
  z-index: 3;
  transform: translate(-50%, -50%) scale(1.08);
  box-shadow: 0 18px 40px rgba(0,0,0,.5), 0 0 0 4px rgba(125,195,229,.2);
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
.jpdb-reader-similar-grid {
  grid-template-columns: repeat(auto-fit, minmax(158px, 1fr));
  gap: 8px;
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
  gap: 3px;
  align-content: start;
  min-height: 86px;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.jpdb-reader-similar-word-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.jpdb-reader-similar-word-head > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jpdb-reader-similar-reading,
.jpdb-reader-similar-meaning {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
}
.jpdb-reader-similar-reading {
  -webkit-line-clamp: 1;
}
.jpdb-reader-similar-meaning {
  -webkit-line-clamp: 2;
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
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex: 0 0 auto !important;
  box-sizing: border-box !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: max-content !important;
  height: 28px !important;
  min-height: 28px !important;
  max-height: 30px !important;
  padding: 4px 9px !important;
  border: 1px solid var(--jpdb-reader-border) !important;
  border-radius: 7px !important;
  background: transparent !important;
  color: var(--jpdb-reader-text) !important;
  cursor: pointer;
  font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  white-space: nowrap !important;
}
.jpdb-reader-mini-btn:hover,
.jpdb-reader-mini-btn:focus-visible {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-accent);
  outline: none;
}

.jpdb-reader-actions {
  position: sticky;
  bottom: -14px;
  z-index: 4;
  border-top: 1px solid var(--jpdb-reader-border);
  margin: 12px -14px -14px;
  padding: 12px 14px 14px;
  display: grid;
  gap: 8px;
  background:
    linear-gradient(to bottom, color-mix(in srgb, var(--jpdb-reader-bg) 0%, transparent), var(--jpdb-reader-bg) 16px),
    var(--jpdb-reader-bg);
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
.jpdb-reader-btn.primary {
  color: var(--jpdb-reader-accent-readable);
  border-color: var(--jpdb-reader-accent);
  background: color-mix(in srgb, var(--jpdb-reader-accent) 10%, transparent);
}
.jpdb-reader-btn.add { color: var(--jpdb-reader-accent-readable); border-color: var(--jpdb-reader-accent); }
.jpdb-reader-btn.nf { color: var(--jpdb-reader-accent-readable); border-color: var(--jpdb-reader-accent); }
.jpdb-reader-btn.blacklist {
  color: var(--jpdb-reader-state-ignored, #b8a7ff);
  border-color: var(--jpdb-reader-state-ignored, #b8a7ff);
}
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
  color: var(--jpdb-reader-accent-readable);
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
.jpdb-reader-settings a { color: var(--jpdb-reader-accent-readable) !important; text-decoration: underline; text-underline-offset: 3px; }
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
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
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
.jpdb-reader-dictionary-priorities,
.jpdb-reader-kanji-priorities { display: grid; gap: 7px; margin: 10px 0; }
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
  grid-template-columns: 48px minmax(130px, 1fr) minmax(120px, .8fr) 74px 58px;
  gap: 8px;
  align-items: center;
}
.jpdb-reader-dictionary-head.compact,
.jpdb-reader-dictionary-row.compact {
  grid-template-columns: 48px minmax(160px, 1fr) 74px 58px;
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
.jpdb-reader-audio-source-row,
.jpdb-reader-lookup-link-row {
  display: grid;
  grid-template-columns: 44px minmax(150px, .8fr) minmax(0, 1.2fr) 96px;
  gap: 8px;
  align-items: start;
}
.jpdb-reader-audio-source-head { color: var(--jpdb-reader-faint); font-size: 11px; font-weight: 700; text-transform: uppercase; }
.jpdb-reader-audio-source-row,
.jpdb-reader-lookup-link-row {
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
.jpdb-reader-audio-source-row .jpdb-reader-row-tools {
  min-width: 122px;
}
.jpdb-reader-audio-source-row .jpdb-reader-icon-mini {
  width: 38px !important;
  min-width: 38px !important;
  max-width: 38px !important;
  height: 38px !important;
  min-height: 38px !important;
  max-height: 38px !important;
}
.jpdb-reader-icon-mini {
  display: inline-grid !important;
  place-items: center !important;
  width: 34px !important;
  min-width: 34px !important;
  max-width: 34px !important;
  height: 34px !important;
  min-height: 34px !important;
  max-height: 34px !important;
  padding: 0 !important;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 7px;
  background: transparent;
  color: var(--jpdb-reader-text);
  cursor: pointer;
  font: 800 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-reader-icon-mini svg {
  display: block;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
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
  color: var(--subtitle-color) !important;
  text-decoration: none !important;
  text-shadow:
    0 2px 2px var(--subtitle-outline),
    0 0 2px var(--subtitle-outline),
    0 0 10px rgba(0,0,0,.96),
    0 0 18px rgba(0,0,0,.78);
  -webkit-text-stroke: .028em color-mix(in srgb, var(--subtitle-outline) 72%, transparent);
  paint-order: stroke fill;
}
.jpdb-subtitle-primary .jpdb-reader-word:hover,
.jpdb-subtitle-primary .jpdb-reader-word:focus-visible {
  background: rgba(255,255,255,.14) !important;
}
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-new,
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-suspended,
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-not-in-deck { color: var(--jpdb-reader-state-new, #58a6ff) !important; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-learning { color: var(--jpdb-reader-state-learning, #ffd166) !important; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-known,
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-never-forget,
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-redundant { color: var(--jpdb-reader-state-known, #7bd88f) !important; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-due { color: var(--jpdb-reader-state-due, #ffb454) !important; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-failed { color: var(--jpdb-reader-state-failed, #ff6b6b) !important; }
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-blacklisted,
.jpdb-subtitle-primary .jpdb-reader-word.jpdb-locked { color: var(--jpdb-reader-state-ignored, #b8a7ff) !important; }
.jpdb-reader-highlight-pitch .jpdb-subtitle-primary .jpdb-reader-word { color: var(--subtitle-color) !important; }
.jpdb-reader-highlight-pitch .jpdb-subtitle-primary .jpdb-reader-word.jpdb-pitch-heiban { color: #359eff !important; }
.jpdb-reader-highlight-pitch .jpdb-subtitle-primary .jpdb-reader-word.jpdb-pitch-atamadaka { color: #fe4b74 !important; }
.jpdb-reader-highlight-pitch .jpdb-subtitle-primary .jpdb-reader-word.jpdb-pitch-nakadaka { color: #fba840 !important; }
.jpdb-reader-highlight-pitch .jpdb-subtitle-primary .jpdb-reader-word.jpdb-pitch-odaka { color: #57ccb7 !important; }
.jpdb-reader-highlight-pitch .jpdb-subtitle-primary .jpdb-reader-word.jpdb-pitch-kifuku { color: #9050f6 !important; }
.jpdb-reader-highlight-off .jpdb-subtitle-primary .jpdb-reader-word {
  background: transparent !important;
  color: var(--subtitle-color) !important;
  text-decoration-color: transparent !important;
}
.jpdb-subtitle-primary .jpdb-reader-furi { color: currentColor; opacity: .8; }
.jpdb-reader-subtitle-preview {
  min-height: 94px;
  padding: 18px 10px;
  border: 1px solid var(--jpdb-reader-border);
  border-radius: 10px;
  background:
    linear-gradient(135deg, rgba(255,255,255,.10) 25%, transparent 25% 50%, rgba(255,255,255,.10) 50% 75%, transparent 75%) 0 0 / 28px 28px,
    #1c222b;
  display: grid;
  place-items: center;
  text-align: center;
  overflow: hidden;
  color: var(--subtitle-color);
  font: var(--subtitle-weight) var(--subtitle-font-size)/1.24 var(--subtitle-family);
  text-shadow:
    0 2px 2px var(--subtitle-outline),
    0 0 2px var(--subtitle-outline),
    0 0 10px rgba(0,0,0,.86);
}
.jpdb-reader-subtitle-preview .jpdb-subtitle-primary {
  display: inline;
}
.jpdb-subtitle-rail {
  position: absolute;
  right: max(10px, env(safe-area-inset-right));
  top: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: calc(100% - 20px);
  padding: 4px;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 10px;
  background: rgba(18,22,28,.56);
  box-shadow: 0 12px 30px rgba(0,0,0,.28);
  backdrop-filter: blur(14px);
  pointer-events: auto;
  opacity: .78;
  transition: opacity .14s ease, background .14s ease, border-color .14s ease;
}
.jpdb-subtitle-controls-hidden .jpdb-subtitle-menu,
.jpdb-subtitle-controls-hidden .jpdb-subtitle-list {
  display: none !important;
}
.jpdb-subtitle-controls-hidden .jpdb-subtitle-rail {
  opacity: .12;
}
.jpdb-subtitle-controls-hidden .jpdb-subtitle-rail:hover,
.jpdb-subtitle-controls-hidden .jpdb-subtitle-rail:focus-within {
  opacity: 1;
}
.jpdb-subtitle-controls-auto .jpdb-subtitle-rail:not(:hover):not(:focus-within) { opacity: .72; }
.jpdb-subtitle-controls-auto:not(.jpdb-subtitle-menu-open):not(.jpdb-subtitle-panel-open) .jpdb-subtitle-rail:not(:hover):not(:focus-within) button[data-action="previous"],
.jpdb-subtitle-controls-auto:not(.jpdb-subtitle-menu-open):not(.jpdb-subtitle-panel-open) .jpdb-subtitle-rail:not(:hover):not(:focus-within) button[data-action="next"],
.jpdb-subtitle-controls-auto:not(.jpdb-subtitle-menu-open):not(.jpdb-subtitle-panel-open) .jpdb-subtitle-rail:not(:hover):not(:focus-within) button[data-action="list"],
.jpdb-subtitle-controls-auto:not(.jpdb-subtitle-menu-open):not(.jpdb-subtitle-panel-open) .jpdb-subtitle-rail:not(:hover):not(:focus-within) .jpdb-subtitle-status {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}
.jpdb-subtitle-controls-always .jpdb-subtitle-rail {
  opacity: 1;
}
.jpdb-subtitle-rail:hover,
.jpdb-subtitle-menu-open .jpdb-subtitle-rail,
.jpdb-subtitle-panel-open .jpdb-subtitle-rail {
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
  display: inline-grid;
  place-items: center;
  min-width: 34px;
  width: 34px;
  height: 34px;
  padding: 0;
  flex: 0 0 auto;
  white-space: nowrap;
  transition: opacity .14s ease, visibility .14s ease, border-color .14s ease, color .14s ease, background .14s ease;
}
.jpdb-subtitle-toggle {
  border-color: color-mix(in srgb, var(--jpdb-reader-accent) 50%, rgba(255,255,255,.22)) !important;
  background: color-mix(in srgb, var(--jpdb-reader-accent) 22%, rgba(24,27,32,.72)) !important;
}
.jpdb-subtitle-icon {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.jpdb-subtitle-toggle[aria-pressed="false"] {
  color: rgba(255,255,255,.72);
  border-color: rgba(255,255,255,.18) !important;
  background: rgba(24,27,32,.72) !important;
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
  justify-content: center;
  height: 34px;
  min-width: 36px;
  padding: 0 5px;
  border-radius: 7px;
  background: transparent;
  color: rgba(255,255,255,.78);
  border: 0;
  box-shadow: none;
  font: 850 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  transition: opacity .14s ease, visibility .14s ease;
}
.jpdb-subtitle-compact-video .jpdb-subtitle-rail {
  top: 8px;
  right: 8px;
  gap: 3px;
  padding: 3px;
}
.jpdb-subtitle-compact-video .jpdb-subtitle-rail button {
  min-width: 32px;
  width: 32px;
  height: 32px;
}
.jpdb-subtitle-compact-video .jpdb-subtitle-status {
  min-width: 30px;
  padding-inline: 2px;
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
.jpdb-subtitle-menu-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 0 2px;
  color: rgba(255,255,255,.78);
  font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-subtitle-menu button {
  min-height: 36px;
  text-align: left;
  padding: 0 10px;
  box-shadow: none;
}
.jpdb-subtitle-menu-head .jpdb-subtitle-close {
  flex: 0 0 30px;
  min-height: 30px;
}
.jpdb-subtitle-menu button[aria-pressed="true"],
.jpdb-subtitle-track-row button[aria-pressed="true"] {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-accent);
  background: color-mix(in srgb, var(--jpdb-reader-accent) 18%, rgba(255,255,255,.05));
}
.jpdb-subtitle-list {
  position: fixed;
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
  backdrop-filter: blur(18px);
}
.jpdb-subtitle-list-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 9px;
  border-bottom: 1px solid rgba(255,255,255,.12);
  color: rgba(255,255,255,.78);
  font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.jpdb-subtitle-placement {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.jpdb-subtitle-placement button {
  display: inline-grid;
  place-items: center;
  min-width: 28px;
  width: 28px;
  min-height: 28px;
  height: 28px;
  padding: 0;
  text-align: center;
  box-shadow: none;
}
.jpdb-subtitle-placement button[aria-pressed="true"] {
  border-color: var(--jpdb-reader-accent);
  color: var(--jpdb-reader-accent);
  background: color-mix(in srgb, var(--jpdb-reader-accent) 18%, rgba(255,255,255,.05));
}
.jpdb-subtitle-close {
  width: 30px;
  min-width: 30px;
  height: 30px;
  padding: 0 !important;
  border-radius: 50% !important;
  text-align: center !important;
  font-size: 17px !important;
  line-height: 1 !important;
}
.jpdb-subtitle-list-scroll {
  overflow: auto;
  display: grid;
  gap: 2px;
  padding: 6px;
  overscroll-behavior: contain;
}
.jpdb-subtitle-list-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 6px;
  padding: 7px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: rgba(255,255,255,.025);
  cursor: pointer;
}
.jpdb-subtitle-row-seek {
  display: inline-grid;
  place-items: center;
  min-width: 32px;
  width: 32px;
  min-height: 32px;
  height: 32px;
  margin-top: 1px;
  padding: 0 !important;
  border-radius: 999px !important;
  box-shadow: none !important;
}
.jpdb-subtitle-row-body {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: start;
  gap: 3px 8px;
  width: 100%;
  min-height: 34px;
  padding: 0;
  text-align: left;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
.jpdb-subtitle-row-replay {
  align-self: center;
  display: inline-grid;
  place-items: center;
  min-width: 32px;
  width: 32px;
  min-height: 32px;
  height: 32px;
  padding: 0 !important;
  box-shadow: none !important;
}
.jpdb-subtitle-list-row.active {
  border-color: rgba(94,167,128,.88);
  background: rgba(94,167,128,.2);
}
.jpdb-subtitle-row-time {
  color: rgba(255,255,255,.55);
  font-size: 11px;
  line-height: 1.4;
}
.jpdb-subtitle-row-text {
  min-width: 0;
  grid-column: 2;
  overflow-wrap: anywhere;
  font-weight: 700;
  line-height: 1.48;
  font-size: 15px;
  letter-spacing: 0;
}
.jpdb-subtitle-row-text .jpdb-reader-word {
  color: inherit;
  background: transparent;
  border-radius: 4px;
  padding: 0 1px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
.jpdb-subtitle-row-text .jpdb-reader-word:hover,
.jpdb-subtitle-row-text .jpdb-reader-word:focus-visible {
  background: rgba(255,255,255,.14);
  outline: 1px solid rgba(255,255,255,.28);
}
.jpdb-subtitle-row-translation {
  grid-column: 2;
  min-width: 0;
  margin-top: 3px;
  color: rgba(255,255,255,.68);
  overflow-wrap: anywhere;
  font-style: normal;
  font-weight: 650;
  line-height: 1.4;
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
.jpdb-subtitle-track-row button {
  min-height: 34px;
  text-align: center;
  box-shadow: none;
}
.jpdb-subtitle-track-tools {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 4px;
}
.jpdb-subtitle-track-tools button {
  min-height: 36px;
  box-shadow: none;
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
  .jpdb-reader-template-preview-grid { grid-template-columns: 1fr; }
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
  .jpdb-reader-dictionary-row,
  .jpdb-reader-dictionary-row.compact { grid-template-columns: 52px 1fr; }
  .jpdb-reader-dictionary-row input[name$=".alias"],
  .jpdb-reader-dictionary-row .jpdb-reader-row-tools,
  .jpdb-reader-dictionary-row-help { grid-column: 2; }
  .jpdb-reader-dictionary-row .jpdb-reader-row-tools { justify-content: flex-start; }
  .jpdb-reader-audio-source-head { display: none; }
  .jpdb-reader-audio-source-row,
  .jpdb-reader-lookup-link-row { grid-template-columns: 52px 1fr; }
  .jpdb-reader-audio-source-row > select { grid-column: 2; }
  .jpdb-reader-audio-source-fields { grid-column: 1 / -1; }
  .jpdb-reader-lookup-link-row input[name$=".urlTemplate"] { grid-column: 1 / -1; }
  .jpdb-reader-audio-source-row .jpdb-reader-row-tools {
    display: grid;
    grid-template-columns: repeat(3, 38px);
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
  .jpdb-reader-lookup-link-row .jpdb-reader-row-tools {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
  .jpdb-ocr-line { min-width: 38px; min-height: 38px; border-radius: 8px; }
  .jpdb-subtitle-text { left: 8px; right: 8px; font-size: min(var(--subtitle-font-size), 8vw); }
  .jpdb-subtitle-rail {
    top: max(8px, env(safe-area-inset-top));
    right: max(8px, env(safe-area-inset-right));
    bottom: auto;
    gap: 3px;
  }
  .jpdb-subtitle-compact-video.jpdb-subtitle-panel-open .jpdb-subtitle-rail,
  .jpdb-subtitle-compact-video.jpdb-subtitle-menu-open .jpdb-subtitle-rail {
    top: -44px;
  }
  .jpdb-subtitle-rail button {
    height: 34px;
    min-width: 34px;
    width: 34px;
    padding: 0;
    font-size: 11px;
  }
  .jpdb-subtitle-menu {
    top: calc(52px + env(safe-area-inset-top));
    right: 8px;
    bottom: auto;
  }
  .jpdb-subtitle-list {
    left: 8px !important;
    right: auto !important;
    width: calc(100vw - 16px) !important;
    max-height: min(48vh, 390px) !important;
    border-radius: 12px 12px 0 0;
  }
}
`;
