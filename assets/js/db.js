/**
 * db.js — localStorage-backed document store with a generic CRUD surface.
 *
 * Purpose:   the only module in the prototype that touches browser storage.
 *            Repositories sit on top of it; pages never import it directly.
 * Depends:   nothing.
 *
 * TODO(backend): this whole file disappears when a real API exists. The
 * repository layer is the seam — see assets/js/repositories/*.js.
 */

const STORAGE_KEY = 'uloominate.db.v1';
const BLOB_DB = 'uloominate.blobs.v1';

let cache = null;
const listeners = new Set();

function blank() {
  return { _meta: { seededAt: null, version: 1 }, collections: {} };
}

function read() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : blank();
  } catch (err) {
    console.warn('[db] corrupt store, starting clean', err);
    cache = blank();
  }
  return cache;
}

function write() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
}

function coll(name) {
  const db = read();
  if (!db.collections[name]) db.collections[name] = [];
  return db.collections[name];
}

export function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Subscribe to any write. Returns an unsubscribe function. */
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function isSeeded() { return !!read()._meta.seededAt; }

export function markSeeded() { read()._meta.seededAt = new Date().toISOString(); write(); }

export function reset() { cache = blank(); write(); }

/** Replace an entire collection. Used by seed.js only. */
export function loadCollection(name, rows) { read().collections[name] = rows.slice(); write(); }

export function create(name, doc) {
  const row = Object.assign({ id: doc.id || uuid(), createdAt: new Date().toISOString() }, doc);
  row.updatedAt = row.createdAt;
  coll(name).push(row);
  write();
  return clone(row);
}

export function findById(name, id) {
  const row = coll(name).find(r => r.id === id);
  return row ? clone(row) : null;
}

export function update(name, id, patch) {
  const rows = coll(name);
  const i = rows.findIndex(r => r.id === id);
  if (i === -1) return null;
  rows[i] = Object.assign({}, rows[i], patch, { id, updatedAt: new Date().toISOString() });
  write();
  return clone(rows[i]);
}

export function remove(name, id) {
  const rows = coll(name);
  const i = rows.findIndex(r => r.id === id);
  if (i === -1) return false;
  rows.splice(i, 1);
  write();
  return true;
}

/** Run several mutations, writing once. Throws roll the batch back. */
export function transaction(fn) {
  const snapshot = JSON.stringify(read());
  try {
    const result = fn();
    write();
    return result;
  } catch (err) {
    cache = JSON.parse(snapshot);
    write();
    throw err;
  }
}

/**
 * findAll(name, opts)
 *   filter      object of field->value | value[] | predicate fn
 *   search      { q, fields: [] }
 *   sort        [{ field, dir }] — multi-column
 *   page        1-based; pageSize
 * Returns { rows, total, page, pageSize, totalPages }.
 */
export function findAll(name, opts = {}) {
  let rows = coll(name).slice();

  if (opts.filter) {
    for (const [field, want] of Object.entries(opts.filter)) {
      if (want === undefined || want === null || want === '' ) continue;
      if (typeof want === 'function') rows = rows.filter(r => want(r[field], r));
      else if (Array.isArray(want)) { if (want.length) rows = rows.filter(r => want.includes(r[field])); }
      else rows = rows.filter(r => r[field] === want);
    }
  }
  if (opts.where) rows = rows.filter(opts.where);

  if (opts.search && opts.search.q) {
    const q = String(opts.search.q).trim().toLowerCase();
    const fields = opts.search.fields || [];
    rows = rows.filter(r => fields.some(f => {
      const v = r[f];
      if (v == null) return false;
      return (Array.isArray(v) ? v.join(' ') : String(v)).toLowerCase().includes(q);
    }));
  }

  if (opts.sort && opts.sort.length) {
    rows.sort((a, b) => {
      for (const { field, dir } of opts.sort) {
        const s = compare(a[field], b[field]) * (dir === 'desc' ? -1 : 1);
        if (s) return s;
      }
      return 0;
    });
  }

  const total = rows.length;
  const pageSize = opts.pageSize || total || 1;
  const page = Math.max(1, opts.page || 1);
  const paged = opts.pageSize ? rows.slice((page - 1) * pageSize, page * pageSize) : rows;
  return {
    rows: paged.map(clone), total, page, pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* ---------------------------------------------------------------- blobs --
 * Uploaded files live in IndexedDB, not localStorage: a 5 MB quota does not
 * survive a couple of PDFs. Records store only the blob key.
 * TODO(backend): replace with a signed-upload call to the storage workspace
 * named in BRD OI-8.
 */
function openBlobStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BLOB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putBlob(key, dataUrl) {
  const idb = await openBlobStore();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('files', 'readwrite');
    tx.objectStore('files').put(dataUrl, key);
    tx.oncomplete = () => resolve(key);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBlob(key) {
  if (!key) return null;
  const idb = await openBlobStore();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('files', 'readonly');
    const req = tx.objectStore('files').get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBlob(key) {
  const idb = await openBlobStore();
  return new Promise(resolve => {
    const tx = idb.transaction('files', 'readwrite');
    tx.objectStore('files').delete(key);
    tx.oncomplete = () => resolve(true);
  });
}

/** Read a File/Blob from an <input type=file> into a data URL. */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

window.addEventListener('storage', e => {
  if (e.key === STORAGE_KEY) { cache = null; listeners.forEach(fn => fn()); }
});
