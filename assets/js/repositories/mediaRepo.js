/**
 * mediaRepo.js — per-vendor media library and resource-file attachment.
 * Depends: api.js, db.js (blob store lives in IndexedDB)
 *
 * REST mapping
 *   GET    /vendors/:id/media     listMedia
 *   POST   /vendors/:id/media     uploadMedia
 *   DELETE /media/:id             deleteMedia
 */

import { db, simulate, collection, resource, listQuery, notFound, badRequest, LATENCY } from '../api.js';

const MAX_MB = 25;

export async function listMedia(vendorId, opts = {}) {
  return simulate(() => collection(db.findAll('media', Object.assign(
    listQuery({
      page: opts.page || 1, pageSize: opts.pageSize || 18, q: opts.q,
      searchFields: ['name'], sort: opts.sort || 'createdAt', sortDir: opts.sortDir || 'desc',
    }),
    { filter: { vendorId, kind: opts.kind } }
  ))), LATENCY.list);
}

/**
 * Stores the bytes in IndexedDB and the metadata in the record. The file
 * survives a hard refresh and re-renders from the blob store.
 * TODO(backend): POST multipart to the external storage workspace and keep
 * only the returned object key.
 */
export async function uploadMedia(vendorId, file, kind = 'image') {
  if (!file) throw badRequest('Choose a file to upload.');
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_MB) {
    throw badRequest('That file is ' + sizeMb.toFixed(1) + ' MB. The limit is ' + MAX_MB + ' MB.', { file: 'Maximum ' + MAX_MB + ' MB' });
  }
  const dataUrl = await db.fileToDataUrl(file);
  const key = 'blob-' + db.uuid();
  await db.putBlob(key, dataUrl);
  return simulate(() => resource(db.create('media', {
    vendorId, kind, blobKey: key, name: file.name,
    mime: file.type || 'application/octet-stream',
    sizeMb: Math.round(sizeMb * 100) / 100,
    createdAt: new Date().toISOString(),
  })), LATENCY.write);
}

export async function getMediaUrl(blobKey) {
  return db.getBlob(blobKey);
}

export async function deleteMedia(id) {
  const row = db.findById('media', id);
  if (!row) throw notFound('File');
  await db.deleteBlob(row.blobKey);
  return simulate(() => { db.remove('media', id); return resource({ id, deleted: true }); }, LATENCY.write);
}

/** Attach an uploaded resource file to a product (FR-5.2). */
export async function attachResourceFile(productId, file) {
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_MB) throw badRequest('That file is larger than the ' + MAX_MB + ' MB prototype limit.', { file: 'Too large' });
  const dataUrl = await db.fileToDataUrl(file);
  const key = 'file-' + db.uuid();
  await db.putBlob(key, dataUrl);
  return simulate(() => resource(db.update('products', productId, {
    fileKey: key, fileName: file.name,
    fileSizeMb: Math.round(sizeMb * 100) / 100,
    lastUpdated: new Date().toISOString(),
  })), LATENCY.write);
}
