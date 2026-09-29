// The storage-message portion of UserScript Compiler 2.0.0 output. Package
// verification also exercises the actual generated background, not this fixture.
export function compilerStorageBackgroundFixture(): string {
    return `(() => {
  const api = globalThis.browser || globalThis.chrome;
  const storagePrefix = "usc_storage_test_";
  const storage = api.storage.local;
  async function queryTabs(query) { return api.tabs.query(query); }

  async function broadcastValueChange(name, oldValue, newValue, sender) {
    const message = {
      channel: 'userscript-compiler',
      type: 'GM_valueChanged',
      payload: { name, oldValue, newValue }
    };
    const tabs = await queryTabs({});
    await Promise.all(tabs.map(tab => {
      if (!tab?.id || !api.tabs?.sendMessage) return Promise.resolve();
      return Promise.resolve(api.tabs.sendMessage(tab.id, message)).catch(() => {});
    }));
  }

  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.channel !== 'userscript-compiler') return;
    const { type, payload } = message;
    (async () => {
      if (type === 'GM_getAllValues' || type === 'GM_listValues') {
        const all = await storage.get(null);
        const entries = Object.entries(all).filter(([key]) => key.startsWith(storagePrefix));
        return type === 'GM_listValues'
          ? { keys: entries.map(([key]) => key.slice(storagePrefix.length)) }
          : { values: Object.fromEntries(entries.map(([key, value]) => [key.slice(storagePrefix.length), value])) };
      }
      const key = storagePrefix + payload.name;
      const oldData = await storage.get(key);
      const oldValue = oldData?.[key];
      if (type === 'GM_getValue') return { value: Object.hasOwn(oldData, key) ? oldValue : payload.defaultValue };
      if (type === 'GM_setValue') {
        await storage.set({ [key]: payload.value });
        await broadcastValueChange(payload.name, oldValue, payload.value, sender);
      } else {
        await storage.remove(key);
        await broadcastValueChange(payload.name, oldValue, undefined, sender);
      }
      return {};
    })().then(respond, error => respond({ error: error.message }));
    return true;
  });
})();`;
}
