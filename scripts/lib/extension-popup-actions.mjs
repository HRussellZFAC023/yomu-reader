// The puck's radial menu draws the same shapes (src/reader/ui/menu-icons.ts).
import MENU_ICON_SHAPES from '../../src/reader/ui/menu-icons.json' with { type: 'json' };

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

// The menu paints the shared ink-and-paper surface, text, surface-2, border and
// readable accent (src/reader/styles/base.css) in both themes, so it reads as よむ.
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
      --menu-bg: #ffffff; --menu-text: #20242b; --menu-hover: #f0f2f5;
      --menu-line: #dfe3e8; --menu-focus: #b8324e; --menu-on: #237e51; --menu-partial: #a36b12;
      margin: 0; min-width: 0; width: 244px; background: var(--menu-bg); color: var(--menu-text);
      font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .yomu-toolbar main { padding: 6px; }
    .yomu-toolbar .menu { display: flex; flex-direction: column; gap: 1px; }
    .yomu-toolbar .menu button {
      display: flex; align-items: center; gap: 10px; width: 100%; min-height: 32px;
      margin: 0; padding: 6px 9px; border: 0; border-radius: 8px; box-shadow: none;
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
      body.yomu-toolbar { --menu-bg: #20242b; --menu-text: #f2f4f8; --menu-hover: #282e37; --menu-line: rgba(255, 255, 255, .12); --menu-focus: #ff7892; --menu-on: #68c49a; --menu-partial: #e1b660; }
    }
  \`;
  document.head.append(style);
  const iconPaths = ${JSON.stringify(MENU_ICON_SHAPES)};

  let pageTab;
  // Study and Settings in the saved interface language, from the background,
  // for a tab with no Yomu page to name them.
  let ownLabels;

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
      // No Yomu in this tab: Study itself, a browser page, a store page, or Yomu not set up yet.
      return undefined;
    }
  }

  async function askBackground() {
    try {
      const labels = await api.runtime.sendMessage({ channel: ${JSON.stringify(CHANNEL)}, type: 'labels' });
      return labels && typeof labels === 'object' ? labels : undefined;
    } catch {
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
    const iconName = action.icon || action.id;
    const shapes = Object.hasOwn(iconPaths, iconName) ? iconPaths[iconName] : iconPaths.fallback;
    for (const [tag, attributes] of shapes) {
      const shape = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
      icon.append(shape);
    }
    if (action.tone) icon.dataset.tone = action.tone;
    const label = document.createElement('span');
    label.textContent = action.label;
    button.append(icon, label);
    return button;
  }

  function render(list) {
    const labels = list || ownLabels;
    document.documentElement.lang = labels?.language === 'ja' ? 'ja' : 'en';
    menu.replaceChildren(
      ...(list?.actions || []).map(actionButton),
      ...(list?.actions?.length ? [document.createElement('hr')] : []),
      actionButton({ id: 'study', label: labels?.studyLabel || 'Study' }),
      actionButton({ id: 'settings', label: labels?.settingsLabel || 'Settings' }),
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

  // Draw once both have answered, so the rows never flash English first.
  Promise.all([askPage('list'), askBackground()]).then(([list, labels]) => {
    ownLabels = labels;
    render(list);
  });
})();`;
}
