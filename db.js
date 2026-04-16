// IndexedDB 封裝 — 所有資料存在手機本機
const DB_NAME = 'idc-finance';
const DB_VERSION = 1;

let _db;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('items')) {
        const s = db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
        s.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains('records')) {
        const s = db.createObjectStore('records', { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date');
        s.createIndex('type', 'type');
      }
    };
    req.onsuccess = e => { _db = e.target.result; res(_db); };
    req.onerror = e => rej(e.target.error);
  });
}

const r = (store, mode, fn) => open().then(db => new Promise((res, rej) => {
  const t = db.transaction([store], mode);
  t.onerror = e => rej(e.target.error);
  const result = fn(t.objectStore(store));
  if (result && result.onsuccess !== undefined) {
    result.onsuccess = e => res(e.target.result);
    result.onerror = e => rej(e.target.error);
  } else {
    t.oncomplete = () => res(result);
  }
}));

const wrap = req => new Promise((res, rej) => {
  req.onsuccess = e => res(e.target.result);
  req.onerror = e => rej(e.target.error);
});

export const db = {
  // ── Items ─────────────────────────────────────────────
  async getItems(type) {
    const all = await r('items', 'readonly', s => s.getAll());
    const filtered = type ? all.filter(i => i.type === type) : all;
    return filtered.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
  },

  async addItem(item) {
    return r('items', 'readwrite', s => s.add(item));
  },

  async updateItem(id, data) {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction(['items'], 'readwrite');
      const s = t.objectStore('items');
      const get = s.get(id);
      get.onsuccess = e => {
        const updated = { ...e.target.result, ...data };
        const put = s.put(updated);
        put.onsuccess = () => res(updated);
        put.onerror = e => rej(e.target.error);
      };
      get.onerror = e => rej(e.target.error);
    }));
  },

  async deleteItem(id) {
    return r('items', 'readwrite', s => s.delete(id));
  },

  // ── Records ───────────────────────────────────────────
  async getRecords({ year, month, type, search, limit = 50, offset = 0 } = {}) {
    const all = await r('records', 'readonly', s => s.getAll());
    let f = all;
    if (year)   f = f.filter(rec => new Date(rec.date).getUTCFullYear() == year);
    if (month)  f = f.filter(rec => (new Date(rec.date).getUTCMonth() + 1) == month);
    if (type)   f = f.filter(rec => rec.type === type);
    if (search) {
      const q = search.toLowerCase();
      f = f.filter(rec => (rec.item_name||'').toLowerCase().includes(q) || (rec.note||'').toLowerCase().includes(q));
    }
    f.sort((a, b) => b.date < a.date ? -1 : b.date > a.date ? 1 : b.id - a.id);
    return { records: f.slice(offset, offset + limit), total: f.length };
  },

  async addRecord(record) {
    return r('records', 'readwrite', s => s.add(record));
  },

  async updateRecord(id, data) {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction(['records'], 'readwrite');
      const s = t.objectStore('records');
      const get = s.get(id);
      get.onsuccess = e => {
        const updated = { ...e.target.result, ...data };
        const put = s.put(updated);
        put.onsuccess = () => res(updated);
        put.onerror = e => rej(e.target.error);
      };
      get.onerror = e => rej(e.target.error);
    }));
  },

  async deleteRecord(id) {
    return r('records', 'readwrite', s => s.delete(id));
  },

  // ── Summary ───────────────────────────────────────────
  async getSummary({ year, month } = {}) {
    const all = await r('records', 'readonly', s => s.getAll());
    let f = all;
    if (year)  f = f.filter(rec => new Date(rec.date).getUTCFullYear() == year);
    if (month) f = f.filter(rec => (new Date(rec.date).getUTCMonth() + 1) == month);

    const summary = { income: 0, expense: 0 };
    f.forEach(rec => { summary[rec.type] = (summary[rec.type] || 0) + (+rec.amount); });
    summary.net = summary.income - summary.expense;

    const yearStats = {};
    all.forEach(rec => {
      const y = new Date(rec.date).getUTCFullYear();
      if (!yearStats[y]) yearStats[y] = { income: 0, expense: 0 };
      yearStats[y][rec.type] = (yearStats[y][rec.type] || 0) + (+rec.amount);
    });

    const catMap = {};
    f.forEach(rec => {
      const k = `${rec.type}__${rec.item_name}`;
      if (!catMap[k]) catMap[k] = { item_name: rec.item_name, type: rec.type, total: 0 };
      catMap[k].total += +rec.amount;
    });
    const byCategory = Object.values(catMap).sort((a, b) => b.total - a.total);

    return { summary, yearStats, byCategory };
  },

  // ── Seed ──────────────────────────────────────────────
  async isEmpty() {
    const cnt = await r('records', 'readonly', s => s.count());
    return cnt === 0;
  },

  async seedAll(items, records) {
    // Put items (preserving explicit IDs)
    await open().then(db => new Promise((res, rej) => {
      const t = db.transaction(['items'], 'readwrite');
      const s = t.objectStore('items');
      items.forEach(i => s.put(i));
      t.oncomplete = res;
      t.onerror = e => rej(e.target.error);
    }));
    // Put records in batches
    const SZ = 100;
    for (let i = 0; i < records.length; i += SZ) {
      await open().then(db => new Promise((res, rej) => {
        const t = db.transaction(['records'], 'readwrite');
        const s = t.objectStore('records');
        records.slice(i, i + SZ).forEach(rec => s.put(rec));
        t.oncomplete = res;
        t.onerror = e => rej(e.target.error);
      }));
    }
  }
};
