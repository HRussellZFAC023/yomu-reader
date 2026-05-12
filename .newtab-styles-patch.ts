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
  gap: 16px;
  margin: 0 auto;
  padding: max(14px, env(safe-area-inset-top)) 0 max(16px, env(safe-area-inset-bottom));
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
  width: 40px;
  height: 40px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--jpdb-newtab-border, rgba(255,255,255,.45));
  border-radius: 50%;
  background: color-mix(in srgb, var(--jpdb-newtab-surface, #fff) 86%, transparent);
  color: var(--jpdb-newtab-accent-text, var(--jpdb-reader-accent));
  box-shadow: 0 6px 20px var(--jpdb-newtab-shadow, rgba(0,0,0,.14));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-size: 16px;
  line-height: 1;
  font-weight: 900;
}

.jpdb-reader-newtab-brand-text {
  display: grid;
  gap: 1px;
  text-align: left;
}

.jpdb-reader-newtab-brand-text strong {
  font-size: 18px;
  line-height: 1;
  font-weight: 900;
}

.jpdb-reader-newtab-brand-text span,
.jpdb-reader-newtab-health {
  font-size: 11px;
  line-height: 1.2;
  font-weight: 720;
  opacity: .88;
}

.jpdb-reader-newtab-health {
  max-width: min(44vw, 480px);
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jpdb-reader-newtab-icon-button {
  min-height: 36px;
  border: 1px solid var(--jpdb-newtab-border, rgba(255,255,255,.45));
  border-radius: 8px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--jpdb-newtab-surface, #fff) 72%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--jpdb-newtab-bg-text, #111);
  font-size: 12px;
  font-weight: 780;
  cursor: pointer;
}

.jpdb-reader-newtab-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(290px, 360px);
  gap: 16px;
  align-items: stretch;
}

.jpdb-reader-newtab-button {
  min-height: 42px;
  border: 1px solid var(--jpdb-newtab-soft-border, rgba(0,0,0,.12));
  border-radius: 10px;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--jpdb-newtab-surface, #fff) 88%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--jpdb-newtab-surface-text, #15171c);
  font-size: 14px;
  font-weight: 780;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background .12s ease, box-shadow .12s ease;
}

.jpdb-reader-newtab-button.primary {
  background: var(--jpdb-newtab-accent-text, var(--jpdb-reader-accent));
  color: var(--jpdb-newtab-surface, #fff);
  border-color: transparent;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--jpdb-newtab-accent-text, var(--jpdb-reader-accent)) 36%, transparent);
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
  outline: 2px solid color-mix(in srgb, var(--jpdb-newtab-bg-text, #111) 28%, transparent);
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
  min-height: clamp(380px, calc(100dvh - 200px), 600px);
  align-self: center;
  display: grid;
  grid-template-rows: auto auto auto auto auto;
  align-content: center;
  justify-items: center;
  gap: clamp(8px, 1.8vh, 18px);
  padding: clamp(18px, 3.6vw, 44px);
  border: 1px solid var(--jpdb-newtab-border, rgba(255,255,255,.45));
  border-radius: 20px;
  box-shadow: 0 10px 36px var(--jpdb-newtab-shadow, rgba(0,0,0,.12));
  background: color-mix(in srgb, var(--jpdb-newtab-surface, #fff) 86%, var(--jpdb-newtab-bg, var(--jpdb-reader-accent)));
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  color: var(--jpdb-newtab-surface-text, #15171c);
  cursor: pointer;
  user-select: none;
  overflow: hidden;
  transition: box-shadow .2s ease;
}

.jpdb-reader-newtab-card:focus-visible {
  outline: 2px solid var(--jpdb-newtab-bg-text, #111);
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
  gap: 8px;
}

.jpdb-reader-newtab-card-head,
.jpdb-reader-newtab-meta {
  color: color-mix(in srgb, var(--jpdb-newtab-surface-text, #15171c) 52%, transparent);
  font-size: 11px;
  line-height: 1.2;
  font-weight: 780;
  text-transform: uppercase;
  letter-spacing: .05em;
}

.jpdb-reader-newtab-meta {
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  text-transform: none;
  letter-spacing: 0;
}

.jpdb-reader-newtab-meta span {
  max-width: 100%;
  border: 1px solid var(--jpdb-newtab-soft-border, rgba(0,0,0,.08));
  border-radius: 999px !important;
  padding: 3px 8px;
  background: var(--jpdb-newtab-surface-muted, rgba(0,0,0,.03));
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jpdb-reader-newtab-visual {
  width: min(120px, 16vw);
  height: min(120px, 16vw);
  display: none;
  place-items: center;
  border: 1px solid var(--jpdb-newtab-soft-border, rgba(0,0,0,.06));
  border-radius: 14px;
  background: var(--jpdb-newtab-surface-muted, rgba(0,0,0,.03));
  color: color-mix(in srgb, var(--jpdb-newtab-accent-text, var(--jpdb-reader-accent)) 18%, transparent);
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-size: clamp(40px, 6vw, 72px);
  font-weight: 900;
  line-height: 1;
}

.jpdb-reader-newtab-word {
  max-width: 100%;
  color: var(--jpdb-newtab-accent-text, var(--jpdb-reader-accent));
  font-size: clamp(46px, 7.5vw, 104px);
  font-weight: 900;
  line-height: 1.04;
  text-align: center;
  overflow-wrap: anywhere;
  letter-spacing: -.01em;
}

.jpdb-reader-newtab-word .jpdb-reader-word {
  background: transparent !important;
  color: inherit;
  text-decoration-color: transparent !important;
}

.jpdb-reader-newtab-answer {
  display: grid;
  gap: 6px;
  justify-items: center;
  max-width: 100%;
  transition: opacity .2s ease, transform .2s ease, filter .2s ease;
}

.jpdb-reader-newtab:not(.jpdb-reader-newtab-revealed) .jpdb-reader-newtab-answer {
  opacity: 0;
  filter: blur(8px);
  transform: translateY(6px);
  pointer-events: none;
}

.jpdb-reader-newtab-revealed .jpdb-reader-newtab-concealed {
  display: none;
}

.jpdb-reader-newtab-reading {
  min-height: 1.15em;
  max-width: min(640px, 100%);
  color: var(--jpdb-newtab-accent-text, var(--jpdb-reader-accent));
  font-size: clamp(20px, 3.2vw, 40px);
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  overflow-wrap: anywhere;
}

.jpdb-reader-newtab-meaning {
  max-width: min(540px, 100%);
  color: color-mix(in srgb, var(--jpdb-newtab-surface-text, #15171c) 78%, var(--jpdb-newtab-accent-text, var(--jpdb-reader-accent)));
  font-size: clamp(14px, 1.8vw, 22px);
  font-weight: 720;
  line-height: 1.36;
  text-align: center;
  overflow-wrap: anywhere;
}

.jpdb-reader-newtab-concealed {
  min-height: 1.2em;
  color: color-mix(in srgb, var(--jpdb-newtab-surface-text, #15171c) 48%, transparent);
  font-size: clamp(12px, 1.4vw, 16px);
  font-weight: 680;
  font-style: italic;
  text-align: center;
}

.jpdb-reader-newtab-kanji-mode .jpdb-reader-newtab-word {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  font-size: clamp(72px, 13vw, 170px);
}

.jpdb-reader-newtab-kanji-mode .jpdb-reader-newtab-visual {
  display: none;
}

.jpdb-reader-newtab-controls {
  min-height: 46px;
}

.jpdb-reader-newtab-status {
  min-width: 0;
  color: var(--jpdb-newtab-bg-text, #111);
  font-size: 11px;
  font-weight: 700;
  opacity: .78;
  text-align: right;
  overflow-wrap: anywhere;
}

.jpdb-reader-newtab-side {
  min-width: 0;
  display: grid;
  grid-template-rows: auto auto minmax(120px, 1fr) auto;
  gap: 10px;
}

.jpdb-reader-newtab-panel,
.jpdb-reader-newtab-source-note {
  border: 1px solid var(--jpdb-newtab-border, rgba(255,255,255,.45));
  border-radius: 14px;
  background: color-mix(in srgb, var(--jpdb-newtab-surface, #fff) 78%, transparent);
  backdrop-filter: blur(18px) saturate(1.1);
  -webkit-backdrop-filter: blur(18px) saturate(1.1);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--jpdb-newtab-shadow, rgba(0,0,0,.14)) 50%, transparent);
}

.jpdb-reader-newtab-panel {
  display: grid;
  gap: 8px;
  padding: 12px;
}

.jpdb-reader-newtab-panel-head {
  color: var(--jpdb-newtab-surface-text, #15171c);
  font-size: 10px;
  font-weight: 860;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.jpdb-reader-newtab-panel-head button {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--jpdb-newtab-accent-text, var(--jpdb-reader-accent));
  font: inherit;
  text-transform: none;
  letter-spacing: 0;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.jpdb-reader-newtab-segmented,
.jpdb-reader-newtab-filter-grid {
  display: grid;
  gap: 5px;
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
  min-height: 32px;
  border: 1px solid var(--jpdb-newtab-soft-border, rgba(0,0,0,.10));
  border-radius: 8px;
  background: color-mix(in srgb, var(--jpdb-newtab-surface-muted, rgba(0,0,0,.03)) 80%, transparent);
  color: var(--jpdb-newtab-surface-text, #15171c);
  font-size: 12px;
  font-weight: 740;
  cursor: pointer;
  transition: background .1s ease;
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
  gap: 6px;
}

.jpdb-reader-newtab-form-grid label,
.jpdb-reader-newtab-search {
  display: grid;
  gap: 3px;
  color: color-mix(in srgb, var(--jpdb-newtab-surface-text, #15171c) 60%, transparent);
  font-size: 10px;
  font-weight: 740;
}

.jpdb-reader-newtab select,
.jpdb-reader-newtab input {
  min-height: 34px;
  width: 100%;
  border: 1px solid var(--jpdb-newtab-soft-border, rgba(0,0,0,.10));
  border-radius: 8px;
  padding: 5px 8px;
  background: color-mix(in srgb, var(--jpdb-newtab-surface, #fff) 90%, transparent);
  color: var(--jpdb-newtab-surface-text, #15171c);
  font-size: 13px;
  font-weight: 660;
}

.jpdb-reader-newtab-queue-panel {
  min-height: 0;
}

.jpdb-reader-newtab-list {
  min-height: 0;
  max-height: 100%;
  display: grid;
  align-content: start;
  gap: 4px;
  overflow: auto;
  padding-right: 2px;
}

.jpdb-reader-newtab-list-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  text-align: left;
}

.jpdb-reader-newtab-list-item span,
.jpdb-reader-newtab-list-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jpdb-reader-newtab-list-item span {
  font-size: 15px;
  font-weight: 820;
}

.jpdb-reader-newtab-list-item small {
  font-size: 10px;
  font-weight: 740;
  opacity: .68;
}

.jpdb-reader-newtab-list-item.active small {
  opacity: 1;
}

.jpdb-reader-newtab-source-note {
  padding: 9px 11px;
  color: color-mix(in srgb, var(--jpdb-newtab-surface-text, #15171c) 60%, transparent);
  font-size: 11px;
  line-height: 1.4;
  font-weight: 660;
}

.jpdb-reader-newtab-source-note p {
  margin: 0;
}

.jpdb-reader-newtab-source-note p + p {
  margin-top: 4px;
}

.jpdb-reader-newtab-puck {
  position: fixed;
  right: max(14px, env(safe-area-inset-right));
  bottom: max(14px, env(safe-area-inset-bottom));
  z-index: 2147483641;
  border: 1px solid var(--jpdb-newtab-border, rgba(255,255,255,.45));
  cursor: pointer;
}

.jpdb-reader-newtab-empty {
  display: grid;
  gap: 12px;
  justify-items: center;
  padding: 28px;
  border: 2px dashed var(--jpdb-newtab-border, rgba(255,255,255,.5));
  border-radius: 16px;
  color: var(--jpdb-newtab-bg-text, #111);
  text-align: center;
}

.jpdb-reader-newtab-empty-title {
  font-size: clamp(24px, 6vw, 56px);
  line-height: 1;
  font-weight: 900;
}

.jpdb-reader-newtab-empty p {
  max-width: 480px;
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  font-weight: 680;
}

@media (max-width: 980px) {
  .jpdb-reader-newtab-workspace {
    grid-template-columns: 1fr;
  }

  .jpdb-reader-newtab-side {
    grid-template-rows: auto auto auto auto;
  }

  .jpdb-reader-newtab-card {
    min-height: clamp(340px, 54dvh, 500px);
  }
}

@media (max-width: 700px) {
  .jpdb-reader-newtab-shell {
    width: min(100vw - 16px, 600px);
    gap: 8px;
  }

  .jpdb-reader-newtab-health {
    display: none;
  }

  .jpdb-reader-newtab-card {
    min-height: min(420px, calc(100dvh - 140px));
    padding: 14px;
    border-radius: 14px;
  }

  .jpdb-reader-newtab-word {
    font-size: clamp(36px, 12vw, 68px);
  }

  .jpdb-reader-newtab-reading {
    font-size: clamp(16px, 4.5vw, 28px);
  }

  .jpdb-reader-newtab-meaning {
    font-size: clamp(13px, 3.4vw, 18px);
  }

  .jpdb-reader-newtab-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .jpdb-reader-newtab-status {
    grid-column: 1 / -1;
    text-align: left;
  }

  .jpdb-reader-newtab-form-grid,
  .jpdb-reader-newtab-filter-grid {
    grid-template-columns: 1fr;
  }

  .jpdb-reader-newtab-panel {
    padding: 10px;
  }

  .jpdb-reader-newtab-filter-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

