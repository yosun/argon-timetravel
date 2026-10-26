(function(root) {
  const DATABASE_NAME = 'timetravel-source-contexts';
  const STORE_NAME = 'contexts';
  function isQuotaError(error) {
    return error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014;
  }
  function indexedDatabase(indexedDB) {
    async function open() {
      if (!indexedDB) throw new Error('This browser does not provide storage for large source images.');
      return new Promise((resolve,reject) => {
        const request = indexedDB.open(DATABASE_NAME,1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Source storage could not be opened.'));
        request.onblocked = () => reject(new Error('Close other TIME TRAVEL tabs before saving source images.'));
      });
    }
    return {
      async putAll(contexts) {
        const database = await open();
        try {
          await new Promise((resolve,reject) => {
            const transaction = database.transaction(STORE_NAME,'readwrite');
            transaction.oncomplete = () => resolve();
            transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Source images could not be saved.'));
            const store = transaction.objectStore(STORE_NAME);
            for (const [id,context] of Object.entries(contexts)) store.put(context,id);
          });
        } finally { database.close(); }
      },
      async getAll(ids) {
        const database = await open();
        try {
          return await new Promise((resolve,reject) => {
            const contexts = {};
            const transaction = database.transaction(STORE_NAME,'readonly');
            transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Source images could not be restored.'));
            transaction.oncomplete = () => {
              if (ids.some(id => !contexts[id])) reject(new Error('A saved source image is unavailable. Existing history records were retained.'));
              else resolve(contexts);
            };
            const store = transaction.objectStore(STORE_NAME);
            for (const id of ids) {
              const request = store.get(id);
              request.onsuccess = () => { contexts[id] = request.result; };
            }
          });
        } finally { database.close(); }
      }
    };
  }
  function create({storage,indexedDB = root.indexedDB,database = indexedDatabase(indexedDB)}) {
    return {
      async save(key,envelope) {
        try {
          storage.setItem(key,JSON.stringify(envelope));
          return {contextStorage:'localstorage'};
        } catch (error) {
          if (!isQuotaError(error)) throw error;
        }
        // The existing localStorage entry stays intact until the source transaction commits.
        // Context IDs are immutable, so a failed pointer write cannot alter old history sources.
        const contexts = envelope.contexts || {};
        await database.putAll(contexts);
        const references = Object.fromEntries(Object.keys(contexts).map(id => [id,{storage:'indexeddb',key:id}]));
        storage.setItem(key,JSON.stringify({...envelope,contexts:references,contextStorage:'indexeddb'}));
        return {contextStorage:'indexeddb'};
      },
      async load(key) {
        const saved = JSON.parse(storage.getItem(key) || '{}');
        if (saved.contextStorage !== 'indexeddb') return saved;
        const references = Object.entries(saved.contexts || {});
        if (references.some(([,reference]) => reference?.storage !== 'indexeddb' || typeof reference.key !== 'string')) throw new Error('Invalid saved source references.');
        const sources = await database.getAll(references.map(([,reference]) => reference.key));
        return {...saved,contexts:Object.fromEntries(references.map(([id,reference]) => [id,sources[reference.key]]))};
      }
    };
  }
  const api = {create,isQuotaError};
  if (typeof module !== 'undefined') module.exports = api;
  else root.HistoryStorage = api;
})(globalThis);
