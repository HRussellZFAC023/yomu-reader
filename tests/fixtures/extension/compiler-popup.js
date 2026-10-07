const api = globalThis.browser || globalThis.chrome;
const config = {
  "pages": [
    {
      "path": "newtab/index.html",
      "label": "Open Study"
    }
  ],
  "homepageUrl": "https://yomureader.com",
  "homepageLabel": "Documentation",
  "settingsEvent": "yomu-open-settings",
  "settingsLabel": "Settings on this page",
  "iconPath": "newtab/icons/icon128.png"
};
const status = document.querySelector('[data-status]');
const primaryActions = document.querySelector('[data-primary-actions]');
const scriptMenuSection = document.querySelector('[data-script-menu-section]');
const scriptMenu = document.querySelector('[data-script-menu]');
const brandIcon = document.querySelector('[data-brand-icon]');

if (brandIcon && config.iconPath) {
  const iconUrl = api?.runtime?.getURL?.(config.iconPath);
  if (iconUrl) {
    brandIcon.src = iconUrl;
    brandIcon.hidden = false;
    brandIcon.addEventListener('error', () => { brandIcon.hidden = true; }, { once: true });
  }
}

function setStatus(message) {
  if (status) status.textContent = message || '';
}

function callApi(fn, thisArg, ...args) {
  if (!fn) return Promise.reject(new Error('Browser API is unavailable.'));
  if (fn.length > args.length) {
    return new Promise((resolve, reject) => {
      try {
        fn.call(thisArg, ...args, value => {
          const error = api.runtime?.lastError;
          if (error) reject(new Error(error.message));
          else resolve(value);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  try {
    const result = fn.call(thisArg, ...args);
    return result && typeof result.then === 'function' ? result : Promise.resolve(result);
  } catch (error) {
    return Promise.reject(error);
  }
}

async function send(type, payload = {}) {
  return api.runtime.sendMessage({ channel: 'userscript-compiler', type, payload });
}

function extensionUrl(path) {
  return api.runtime.getURL(String(path || '').replace(/^\/+/, ''));
}

async function openUrl(url) {
  await callApi(api.tabs?.create, api.tabs, { url, active: true });
  window.close();
}

async function openPath(path) {
  await openUrl(extensionUrl(path));
}

async function activeTab() {
  const tabs = await callApi(api.tabs?.query, api.tabs, { active: true, currentWindow: true });
  return Array.isArray(tabs) ? tabs[0] : undefined;
}

function isInjectableTab(tab) {
  const url = tab?.url || '';
  return /^https?:|^file:/i.test(url);
}

// Dispatch a script-defined settings-open CustomEvent inside the content-script
// (ISOLATED) world of the active tab. Only used when the project configures
// branding.settingsEvent. Falls back to opening the first packaged page if the
// tab is not injectable or the scripting API is unavailable/blocked.
async function openSettingsOnActiveTab() {
  const eventName = config.settingsEvent;
  if (!eventName) throw new Error('This build has no in-page settings surface.');
  const tab = await activeTab();
  const canInject = tab?.id && isInjectableTab(tab) && api?.scripting?.executeScript;
  if (!canInject) {
    if (config.pages && config.pages.length) {
      await openPath(config.pages[0].path);
      return;
    }
    throw new Error('Open a normal web page (http/https) to reach in-page settings.');
  }
  await api.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'ISOLATED',
    args: [eventName],
    func: name => {
      try {
        window.dispatchEvent(new CustomEvent(name, { detail: {} }));
      } catch (error) {
        console.error('Failed to dispatch settings event:', error);
      }
    },
  });
  window.close();
}

function addButton(container, action, label, opts = {}) {
  if (!container) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = action;
  if (opts.path) button.dataset.path = opts.path;
  button.textContent = label;
  if (opts.primary) button.classList.add('primary');
  container.append(button);
}

function renderPrimaryActions() {
  if (!primaryActions) return;
  primaryActions.textContent = '';
  (config.pages || []).forEach((page, index) => {
    addButton(primaryActions, 'open-page', page.label || 'Open page', { primary: index === 0, path: page.path });
  });
  if (config.settingsEvent) addButton(primaryActions, 'open-settings', config.settingsLabel || 'Open settings');
  if (config.homepageUrl) addButton(primaryActions, 'open-docs', config.homepageLabel || 'Homepage');
}

function renderScriptCommands(commands) {
  if (!scriptMenu || !scriptMenuSection) return;
  scriptMenu.textContent = '';
  if (!commands.length) {
    scriptMenuSection.hidden = true;
    return;
  }
  for (const command of commands) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.menuId = command.id;
    button.textContent = command.title || 'Page command';
    scriptMenu.append(button);
  }
  scriptMenuSection.hidden = false;
}

async function refreshScriptCommands() {
  try {
    const tab = await activeTab();
    const response = await send('USC_listMenuCommands', { tabId: tab?.id });
    renderScriptCommands(response?.commands || []);
  } catch {
    renderScriptCommands([]);
  }
}

document.addEventListener('click', async event => {
  const scriptButton = event.target.closest('[data-menu-id]');
  if (scriptButton) {
    scriptButton.disabled = true;
    try {
      const tab = await activeTab();
      const response = await send('USC_runMenuCommand', { id: scriptButton.dataset.menuId, tabId: tab?.id });
      setStatus(response?.handled ? 'Sent.' : 'Open a matching page and try again.');
    } catch (error) {
      setStatus(error?.message || String(error));
    } finally {
      scriptButton.disabled = false;
      await refreshScriptCommands();
    }
    return;
  }

  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  button.disabled = true;
  try {
    if (action === 'open-page') {
      const path = button.dataset.path;
      if (!path) throw new Error('No page is packaged for this button.');
      await openPath(path);
    } else if (action === 'open-settings') {
      await openSettingsOnActiveTab();
    } else if (action === 'open-docs') {
      if (!config.homepageUrl) throw new Error('No homepage URL is configured.');
      await openUrl(config.homepageUrl);
    }
  } catch (error) {
    setStatus(error?.message || String(error));
  } finally {
    button.disabled = false;
  }
});

renderPrimaryActions();
refreshScriptCommands();
setStatus("");
