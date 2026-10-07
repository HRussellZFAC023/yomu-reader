// Own the complete popup entry point. Appending to the compiler's popup leaves
// its legacy menu and in-page settings injection active alongside our actions.
const EXTENSION_POPUP_ACTIONS_MARKER = 'yomu-extension-popup-actions:v2';
const CHANNEL = 'yomu-popup-actions';
const SETTINGS_PATH = 'newtab/index.html#settings=appearance';

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
  const toneColours = { on: '#2f9e6b', partial: '#d99a1e' };
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
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.gap = '8px';
    if (typeof action.pressed === 'boolean') button.setAttribute('aria-pressed', String(action.pressed));
    if (action.tone) {
      const dot = document.createElement('span');
      dot.setAttribute('aria-hidden', 'true');
      dot.dataset.tone = action.tone;
      Object.assign(dot.style, { flex: '0 0 auto', width: '8px', height: '8px', borderRadius: '50%', boxSizing: 'border-box', border: '1.5px solid currentColor', background: toneColours[action.tone] || 'transparent', borderColor: toneColours[action.tone] || 'currentColor', opacity: action.tone === 'off' ? '0.5' : '1' });
      button.append(dot);
    }
    button.append(document.createTextNode(action.label));
    return button;
  }

  function render(list) {
    menu.replaceChildren(
      ...(list?.actions || []).map(actionButton),
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
    [...menu.querySelectorAll('[data-yomu-action]')].find(action => action.dataset.yomuAction === id)?.focus();
  });

  render(undefined);
  askPage('list').then(list => { if (list) render(list); });
})();`;
}
