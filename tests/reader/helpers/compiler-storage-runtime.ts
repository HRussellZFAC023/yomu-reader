export function generatedCompilerStorageSource(): string {
    return `/* UserScript Compiler GM compatibility runtime. */
(() => {
  const api = globalThis.browser || globalThis.chrome;
  const values = Object.create(null);
  const listeners = new Map();
  let valuesHydrated = false;
  let listenerSeq = 0;

  function gmMessage(type, payload) {
    return api.runtime.sendMessage({ channel: 'userscript-compiler', type, payload }).then(response => {
      if (response?.error) throw new Error(response.error);
      return response;
    });
  }

  function notifyValueListeners(name, oldValue, newValue, remote) {
    for (const listener of listeners.values()) {
      if (listener.name === name) listener.callback(name, oldValue, newValue, Boolean(remote));
    }
  }

  function GM_getValue(name, defaultValue) {
    if (Object.prototype.hasOwnProperty.call(values, name)) return values[name];
    if (valuesHydrated) return defaultValue;
    return gmMessage('GM_getValue', { name, defaultValue }).then(response => {
      values[name] = response?.value;
      return response?.value;
    }, () => defaultValue);
  }
  function GM_setValue(name, value) {
    const oldValue = values[name];
    values[name] = value;
    notifyValueListeners(name, oldValue, value, false);
    return gmMessage('GM_setValue', { name, value }).catch(() => {});
  }
  function GM_deleteValue(name) {
    const oldValue = values[name];
    delete values[name];
    notifyValueListeners(name, oldValue, undefined, false);
    return gmMessage('GM_deleteValue', { name }).catch(() => {});
  }
  function GM_listValues() {
    if (valuesHydrated) return Object.keys(values);
    return gmMessage('GM_listValues', {}).then(response => response?.keys || Object.keys(values));
  }
  function GM_addValueChangeListener(name, callback) {
    const id = ++listenerSeq;
    listeners.set(id, { name, callback });
    return id;
  }
  const GM = {
    getValue: GM_getValue,
    setValue: GM_setValue,
    deleteValue: GM_deleteValue,
    listValues: GM_listValues,
  };
  Object.assign(globalThis, { GM, GM_getValue, GM_setValue, GM_deleteValue, GM_listValues, GM_addValueChangeListener });
  globalThis.__USC_READY = gmMessage('GM_getAllValues', {}).then(response => {
    Object.assign(values, response?.values || {});
    valuesHydrated = true;
  }, () => {
    valuesHydrated = true;
  });
})();

Promise.resolve(globalThis.__USC_READY).catch(() => {}).then(() => {
  try {
    globalThis.__YOMU_TEST_BODY_RAN__ = true;
  } catch (error) {
    console.error('Userscript failed:', error);
  }
});`;
}
