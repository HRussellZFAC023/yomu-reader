import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';

/** Exercise the exact packaged compiler bytes with isolated, in-memory storage. */
export async function assertCompilerStorageContract(background, gmRuntimePrelude, prefix, target) {
    const key = '__yomu_storage_contract__';
    const values = { [prefix + key]: 'hydrated' };
    const listeners = [];
    const notifications = [];
    const acknowledgements = [];
    let rejectStorage = false;
    let rejectReads = false;
    let releaseDiscovery = () => undefined;
    let discovery = Promise.resolve();
    let releaseRecipient;
    const recipient = new Promise(resolve => { releaseRecipient = resolve; });
    const storage = {
        get: async name => {
            if (rejectReads) throw new Error('contract-read-rejection');
            return name === null ? structuredClone(values)
                : Object.hasOwn(values, name) ? { [name]: structuredClone(values[name]) } : {};
        },
        set: async next => {
            if (rejectStorage) throw new Error('contract-storage-rejection');
            Object.assign(values, structuredClone(next));
        },
        remove: async name => {
            if (rejectStorage) throw new Error('contract-storage-rejection');
            delete values[name];
        },
    };
    const runtime = {
        id: 'yomu-storage-contract',
        getURL: file => `moz-extension://yomu-storage-contract/${file}`,
        onMessage: { addListener: listener => listeners.push(listener) },
    };
    const browser = {
        runtime,
        storage: { local: storage },
        tabs: {
            query: async () => { await discovery; return [{ id: 1 }, { id: 2 }]; },
            sendMessage: (id, message) => {
                notifications.push({ id, message });
                return id === 2 ? recipient : Promise.resolve();
            },
        },
    };
    const globals = { console, URL, TextEncoder, TextDecoder, Blob, File, atob, btoa, crypto, structuredClone, setTimeout, clearTimeout, setInterval, clearInterval };
    runInNewContext(background, { ...globals, browser }, { timeout: 2_000 });
    const clientRuntime = {
        getURL: runtime.getURL,
        onMessage: { addListener: () => undefined },
        sendMessage: message => new Promise(resolve => {
            const respond = response => {
                acknowledgements.push({ type: message.type, notifications: notifications.map(notification => ({
                    id: notification.id,
                    name: notification.message.payload.name,
                    oldValue: notification.message.payload.oldValue,
                    newValue: notification.message.payload.newValue,
                })) });
                resolve(response);
            };
            const handled = listeners.some(listener => listener(message, { id: runtime.id, tab: { id: 1 } }, respond) === true);
            if (!handled) resolve(undefined);
        }),
    };
    const client = { ...globals, browser: { runtime: clientRuntime }, fetch: async () => ({ ok: true, json: async () => ({ dictionaries: [] }) }) };
    client.window = client;
    runInNewContext(gmRuntimePrelude, client, { timeout: 2_000 });
    await client.__USC_READY;
    assert.equal(typeof client.GM?.getValue, 'function', `${target}: missing authoritative GM reads`);

    values[prefix + key] = 'durable';
    values[prefix + 'another-context-claim'] = true;
    assert.equal(await client.GM.getValue(key, null), 'durable', `${target}: authoritative read used hydration cache`);
    assert.ok((await client.GM.listValues()).includes('another-context-claim'), `${target}: authoritative enumeration used hydration cache`);
    rejectReads = true;
    await assert.rejects(client.GM.getValue(key, 'fallback'), /contract-read-rejection/, `${target}: failed authoritative read fell back`);
    await assert.rejects(client.GM.listValues(), /contract-read-rejection/, `${target}: failed authoritative enumeration fell back`);
    rejectReads = false;

    try {
        for (const operation of ['set', 'delete']) {
            discovery = new Promise(resolve => { releaseDiscovery = resolve; });
            const notificationStart = notifications.length;
            const ackStart = acknowledgements.length;
            let response;
            const pending = (operation === 'set' ? client.GM.setValue(key, 'saved') : client.GM.deleteValue(key))
                .then(() => { response = 'success'; }, error => { response = error; });
            await nextTurn();
            assert.equal(values[prefix + key], operation === 'set' ? 'saved' : undefined, `${target}: ${operation} did not reach storage`);
            assert.equal(response, undefined, `${target}: ${operation} acknowledged before discovery and dispatch`);
            releaseDiscovery();
            await nextTurn();
            assert.equal(response, 'success', `${target}: ${operation} acknowledgement waits for a recipient`);
            await pending;
            const acknowledgement = acknowledgements.slice(ackStart).find(item => item.type === (operation === 'set' ? 'GM_setValue' : 'GM_deleteValue'));
            assert.deepEqual(acknowledgement?.notifications.slice(notificationStart), [1, 2].map(id => ({
                id, name: key, oldValue: operation === 'set' ? 'durable' : 'saved', newValue: operation === 'set' ? 'saved' : undefined,
            })), `${target}: ${operation} notifications were not dispatched before acknowledgement`);
        }
        rejectStorage = true;
        const dispatched = notifications.length;
        await assert.rejects(client.GM.setValue(key, 'rejected'), /contract-storage-rejection/);
        await assert.rejects(client.GM.deleteValue(key), /contract-storage-rejection/);
        assert.equal(notifications.length, dispatched, `${target}: rejected mutation dispatched a change`);
        assert.equal(await client.GM.getValue(key, 'absent'), 'absent', `${target}: failed write became visible`);
    } finally {
        releaseDiscovery();
        releaseRecipient();
        await nextTurn();
    }
}
