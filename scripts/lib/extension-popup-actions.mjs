// The toolbar popup's "On this page" section (owner decision 4, 2026-10-07):
// the puck's actions for the active tab, asked of the tab's top frame
// (src/reader/app/extension-popup-actions.ts answers). Appended to the
// compiler-generated popup.js, whose top-level helpers (api, callApi,
// activeTab, openPath) it reuses; the compiler's own "Page actions" list reads
// GM menu commands from a background map that empties whenever the MV3 worker
// idles, so the extension build registers none and uses this instead.
export const EXTENSION_POPUP_ACTIONS_MARKER = 'yomu-extension-popup-actions:v1';
const CHANNEL = 'yomu-popup-actions';
const SETTINGS_PATH = 'newtab/index.html#settings=appearance';

export function installExtensionPopupActionsSource(source) {
    if (source.includes(EXTENSION_POPUP_ACTIONS_MARKER)) return source;
    for (const helper of ['const api =', 'function callApi(', 'async function activeTab(', 'async function openPath(']) {
        if (!source.includes(helper)) throw new Error(`Generated popup.js no longer defines ${helper.replace(/[(=]$/u, '').trim()}, which Yomu's page actions use.`);
    }
    return `${source}\n\n${extensionPopupActionsSource()}\n`;
}

function extensionPopupActionsSource() {
    return `/* ${EXTENSION_POPUP_ACTIONS_MARKER} */
(() => {
  const primary = document.querySelector('[data-primary-actions]')?.closest('section');
  if (!primary) return;
  const section = document.createElement('section');
  section.className = 'section';
  const heading = document.createElement('p');
  heading.className = 'label';
  heading.id = 'yomu-page-actions-label';
  heading.hidden = true;
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-labelledby', heading.id);
  section.append(heading, menu);
  primary.after(section);
  const toneColours = { on: '#2f9e6b', partial: '#d99a1e' };
  let pageTab;

  async function askPage(type, id = '') {
    pageTab ??= await activeTab().catch(() => undefined);
    if (!pageTab?.id || !api.tabs?.sendMessage) return undefined;
    try {
      return await callApi(api.tabs.sendMessage, api.tabs, pageTab.id, { channel: ${JSON.stringify(CHANNEL)}, type, id }, { frameId: 0 });
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
      actionButton({ id: 'settings', label: list?.settingsLabel || 'Settings' }),
    );
    heading.textContent = list?.heading || '';
    heading.hidden = !list?.heading;
  }

  menu.addEventListener('click', async event => {
    const button = event.target.closest('[data-yomu-action]');
    if (!button || button.disabled) return;
    const id = button.dataset.yomuAction;
    if (id === 'settings') {
      await openPath(${JSON.stringify(SETTINGS_PATH)});
      return;
    }
    button.disabled = true;
    const list = await askPage('run', id);
    if (!list) {
      button.disabled = false;
      return;
    }
    render(list);
    [...menu.querySelectorAll('[data-yomu-action]')].find(action => action.dataset.yomuAction === id)?.focus();
  });

  render(undefined);
  askPage('list').then(list => { if (list) render(list); });
})();`;
}
