// Own the complete popup entry point. Appending to the compiler's popup leaves
// its legacy menu and in-page settings injection active alongside our actions.
const EXTENSION_POPUP_ACTIONS_MARKER = 'yomu-extension-popup-actions:v2';
const CHANNEL = 'yomu-popup-actions';
const SETTINGS_PATH = 'newtab/index.html#settings=appearance';
const SETTLE_RELIST_MS = 900;

export function installExtensionPopupActionsSource(source) {
    if (source.includes(EXTENSION_POPUP_ACTIONS_MARKER)) return source;
    for (const helper of ['const api =', 'function callApi(', 'async function activeTab(', 'async function openPath(']) {
        if (!source.includes(helper)) throw new Error(`Generated popup.js no longer defines ${helper.replace(/[(=]$/u, '').trim()}, which Yomu's page actions use.`);
    }
    return `${extensionPopupActionsSource()}\n`;
}

function extensionPopupActionsSource() {
    return `/* ${EXTENSION_POPUP_ACTIONS_MARKER} */
(() => {
  const api = globalThis.browser || globalThis.chrome;
  const main = document.querySelector('main');
  if (!main) return;
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', 'よむ');
  main.replaceChildren(menu);
  document.body.classList.add('yomu-toolbar');
  const style = document.createElement('style');
  style.textContent = \`
    body.yomu-toolbar {
      --menu-bg: #fff; --menu-text: #25272b; --menu-hover: #f0f1f3;
      --menu-line: #e4e5e7; --menu-focus: #346fc4; --menu-on: #237e51; --menu-partial: #a36b12;
      margin: 0; min-width: 0; width: 244px; background: var(--menu-bg); color: var(--menu-text);
      font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .yomu-toolbar main { padding: 6px; }
    .yomu-toolbar .menu { display: flex; flex-direction: column; gap: 1px; }
    .yomu-toolbar .menu button {
      display: flex; align-items: center; gap: 10px; width: 100%; min-height: 32px;
      margin: 0; padding: 6px 9px; border: 0; border-radius: 5px; box-shadow: none;
      background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
    }
    .yomu-toolbar .menu button:hover:not(:disabled) { background: var(--menu-hover); color: inherit; }
    .yomu-toolbar .menu button:focus-visible { outline: 2px solid var(--menu-focus); outline-offset: -2px; background: var(--menu-hover); }
    .yomu-toolbar .menu button:disabled { cursor: wait; opacity: .55; }
    .yomu-toolbar .menu svg { width: 16px; height: 16px; flex: 0 0 16px; opacity: .75; }
    .yomu-toolbar .menu svg[data-tone="on"] { color: var(--menu-on); opacity: 1; }
    .yomu-toolbar .menu svg[data-tone="partial"] { color: var(--menu-partial); opacity: 1; }
    .yomu-toolbar .menu svg[data-tone="off"] { opacity: .5; }
    .yomu-toolbar .menu hr { align-self: stretch; height: 0; margin: 5px 9px; border: 0; border-top: 1px solid var(--menu-line); }
    @media (prefers-color-scheme: dark) {
      body.yomu-toolbar { --menu-bg: #252629; --menu-text: #f0f0f1; --menu-hover: #37383c; --menu-line: #45464a; --menu-focus: #88b4f0; --menu-on: #68c49a; --menu-partial: #e1b660; }
    }
  \`;
  document.head.append(style);
  const compactLabels = {
    'Mute auto-play audio': 'Mute auto-play',
    'Unmute auto-play audio': 'Enable auto-play',
    '音声の自動再生をミュート': '自動再生をミュート',
    '音声の自動再生のミュートを解除': '自動再生を有効に',
  };
  const iconPaths = {
    power: [["path", {"d": "M8 1.5v6M4.1 3.6a5.5 5.5 0 1 0 7.8 0"}]],
    audio: [["path", {"d": "M2 6h3l3-3v10l-3-3H2zM10.5 5.5a4 4 0 0 1 0 5M12.5 3.5a7 7 0 0 1 0 9"}]],
    ocr: [["path", {"d": "M5 2H2v3m9-3h3v3M2 11v3h3m9-3v3h-3M5 6h6M5 9h4"}]],
    'japanese-site': [["circle", {"cx": "8", "cy": "8", "r": "6"}], ["path", {"d": "M2 8h12M8 2c-3 3-3 9 0 12 3-3 3-9 0-12"}]],
    study: [["path", {"d": "M8 3v11M8 4C6 2.5 3.5 2.5 1.5 3v10c2-.5 4.5-.5 6.5 1 2-1.5 4.5-1.5 6.5-1V3c-2-.5-4.5-.5-6.5 1"}]],
    settings: [["path", {"d": "M2 4h3m4 0h5M2 12h7m4 0h1"}], ["circle", {"cx": "7", "cy": "4", "r": "2"}], ["circle", {"cx": "11", "cy": "12", "r": "2"}]],
    youtube: [["rect", {"x": "1.5", "y": "3", "width": "13", "height": "10", "rx": "2"}], ["path", {"d": "m6.5 5.5 4 2.5-4 2.5z"}]],
    subtitles: [["rect", {"x": "1.5", "y": "3", "width": "13", "height": "10", "rx": "2"}], ["path", {"d": "M4 7h3m2 0h3M4 10h8"}]],
    fallback: [["circle", {"cx": "8", "cy": "8", "r": "5.5"}], ["path", {"d": "M5 8h6"}]],
  };
  let pageTab;

  async function openPath(path) {
    await api.tabs.create({ url: api.runtime.getURL(path), active: true });
    window.close();
  }

  async function askPage(type, id = '') {
    try {
      pageTab ??= (await api.tabs.query({ active: true, currentWindow: true }))[0];
      if (!pageTab?.id) return undefined;
      return await api.tabs.sendMessage(pageTab.id, { channel: ${JSON.stringify(CHANNEL)}, type, id }, { frameId: 0 });
    } catch {
      // No Yomu in this tab: a browser page, a store page, or Yomu not set up yet.
      return undefined;
    }
  }

  function actionButton(action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.yomuAction = action.id;
    button.setAttribute('aria-label', action.label);
    if (typeof action.pressed === 'boolean') button.setAttribute('aria-pressed', String(action.pressed));
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [name, value] of Object.entries({ viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) icon.setAttribute(name, value);
    const shapes = Object.hasOwn(iconPaths, action.id) ? iconPaths[action.id] : iconPaths.fallback;
    for (const [tag, attributes] of shapes) {
      const shape = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
      icon.append(shape);
    }
    if (action.tone) icon.dataset.tone = action.tone;
    const label = document.createElement('span');
    label.textContent = Object.hasOwn(compactLabels, action.label) ? compactLabels[action.label] : action.label;
    button.append(icon, label);
    return button;
  }

  function render(list) {
    document.documentElement.lang = list?.language === 'ja' ? 'ja' : 'en';
    menu.replaceChildren(
      ...(list?.actions || []).map(actionButton),
      ...(list?.actions?.length ? [document.createElement('hr')] : []),
      actionButton({ id: 'study', label: list?.studyLabel || 'Study' }),
      actionButton({ id: 'settings', label: list?.settingsLabel || 'Settings' }),
    );
  }

  menu.addEventListener('click', async event => {
    const button = event.target.closest('[data-yomu-action]');
    if (!button || button.disabled) return;
    const id = button.dataset.yomuAction;
    if (id === 'settings' || id === 'study') {
      await openPath(id === 'settings' ? ${JSON.stringify(SETTINGS_PATH)} : 'newtab/index.html');
      return;
    }
    button.disabled = true;
    const list = await askPage('run', id);
    if (!list) {
      render(undefined);
      return;
    }
    render(list);
    focusAction(id);
    // A saved toggle can echo back through the page after it answered; ask once
    // more so the row settles on the state the page actually landed in.
    setTimeout(async () => {
      const settled = await askPage('list');
      if (!settled || menu.querySelector('button:disabled')) return;
      const focused = document.activeElement?.dataset?.yomuAction;
      render(settled);
      if (focused) focusAction(focused);
    }, ${JSON.stringify(SETTLE_RELIST_MS)});
  });

  function focusAction(id) {
    [...menu.querySelectorAll('[data-yomu-action]')].find(action => action.dataset.yomuAction === id)?.focus();
  }

  render(undefined);
  askPage('list').then(list => { if (list) render(list); });
})();`;
}
